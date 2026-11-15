#include <windows.h>
#include <winhttp.h>
#include <atomic>
#include <iostream>
#include <string>
#include <vector>

// WinHTTP owns the callback lifetime through HANDLE_CLOSING. The helper process
// may wait for completion; the Electron UI never waits synchronously on it.
struct Request {
    HANDLE done = CreateEvent(nullptr, TRUE, FALSE, nullptr);
    HANDLE closed = CreateEvent(nullptr, TRUE, FALSE, nullptr);
    std::atomic<bool> closing = false;
    bool ok = false;
    DWORD httpStatus = 0;
    DWORD error = 0;
    std::string body;
    std::vector<char> buffer;
    ~Request() { CloseHandle(done); CloseHandle(closed); }
};

void CALLBACK status(HINTERNET handle, DWORD_PTR raw, DWORD event,
                     LPVOID data, DWORD length) {
    auto* request = reinterpret_cast<Request*>(raw);
    if (!request) return;
    if (event == WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING) {
        SetEvent(request->closed);
        return;
    }
    if (request->closing) return;
    switch (event) {
    case WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE:
        if (!WinHttpReceiveResponse(handle, nullptr)) SetEvent(request->done);
        break;
    case WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE: {
        DWORD code = 0, size = sizeof(code);
        bool headers = WinHttpQueryHeaders(handle, WINHTTP_QUERY_STATUS_CODE |
                WINHTTP_QUERY_FLAG_NUMBER, nullptr, &code, &size, nullptr);
        request->httpStatus = code;
        if (!headers || code != 200) {
            SetEvent(request->done);
            break;
        }
        if (!WinHttpQueryDataAvailable(handle, nullptr)) SetEvent(request->done);
        break;
    }
    case WINHTTP_CALLBACK_STATUS_DATA_AVAILABLE: {
        DWORD size = *static_cast<DWORD*>(data);
        if (!size) {
            request->ok = true;
            SetEvent(request->done);
            break;
        }
        if (size > 1024 * 1024 || request->body.size() + size > 1024 * 1024) {
            SetEvent(request->done);
            break;
        }
        request->buffer.resize(size);
        if (!WinHttpReadData(handle, request->buffer.data(), size, nullptr))
            SetEvent(request->done);
        break;
    }
    case WINHTTP_CALLBACK_STATUS_READ_COMPLETE:
        request->body.append(static_cast<char*>(data), length);
        if (!WinHttpQueryDataAvailable(handle, nullptr)) SetEvent(request->done);
        break;
    case WINHTTP_CALLBACK_STATUS_REQUEST_ERROR:
        if (data && length >= sizeof(WINHTTP_ASYNC_RESULT))
            request->error = static_cast<WINHTTP_ASYNC_RESULT*>(data)->dwError;
        SetEvent(request->done);
        break;
    }
}

bool digits(const std::wstring& value) {
    return !value.empty() && value.size() <= 20 &&
        value.find_first_not_of(L"0123456789") == std::wstring::npos &&
        value.find_first_not_of(L"0") != std::wstring::npos;
}

int wmain(int argc, wchar_t** argv) {
    if (argc != 3) return 2;
    std::wstring command = argv[1], input = argv[2], path;
    const bool douyu = command == L"douyu";
    if (douyu && digits(input)) {
        path = L"/betard/" + input;
    } else if (command == L"room" && digits(input)) {
        path = L"/room/v1/Room/room_init?id=" + input;
    } else if ((command == L"uids" || command == L"rooms")) {
        path = command == L"rooms" ? L"/room/v2/Room/get_by_ids?" : L"/room/v1/Room/get_status_info_by_uids?";
        size_t start = 0;
        int count = 0;
        do {
            size_t end = input.find(L',', start);
            auto id = input.substr(start, end == std::wstring::npos ? end : end - start);
            if (!digits(id) || ++count > 50) return 2;
            if (count > 1) path += L"&";
            path += (command == L"rooms" ? L"ids%5B%5D=" : L"uids%5B%5D=") + id;
            if (end == std::wstring::npos) break;
            start = end + 1;
        } while (true);
    } else return 2;

    auto session = WinHttpOpen(L"MultiViewBrowser-LiveStatus/1.0",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, WINHTTP_FLAG_ASYNC);
    if (!session) return 3;
    WinHttpSetTimeouts(session, 5000, 5000, 5000, 5000);
    auto connection = WinHttpConnect(session, douyu ? L"www.douyu.com" : L"api.live.bilibili.com",
        INTERNET_DEFAULT_HTTPS_PORT, 0);
    auto handle = connection ? WinHttpOpenRequest(connection, L"GET", path.c_str(),
        nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE) : nullptr;
    bool ok = false;
    DWORD httpStatus = 0;
    bool timedOut = false;
    std::string body;
    if (handle) {
        Request request;
        DWORD redirect = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
        WinHttpSetOption(handle, WINHTTP_OPTION_REDIRECT_POLICY, &redirect, sizeof(redirect));
        DWORD_PTR context = reinterpret_cast<DWORD_PTR>(&request);
        WinHttpSetOption(handle, WINHTTP_OPTION_CONTEXT_VALUE, &context, sizeof(context));
        WinHttpSetStatusCallback(handle, status,
            WINHTTP_CALLBACK_FLAG_ALL_COMPLETIONS | WINHTTP_CALLBACK_FLAG_HANDLES, 0);
        bool sent = WinHttpSendRequest(handle, L"Accept: application/json\r\n", -1,
            WINHTTP_NO_REQUEST_DATA, 0, 0, context);
        bool completed = sent && WaitForSingleObject(request.done, 12000) == WAIT_OBJECT_0;
        request.closing = true;
        WinHttpCloseHandle(handle);
        // Do not read or release callback-owned buffers while callbacks can run.
        // The parent additionally enforces a 14-second worker deadline.
        WaitForSingleObject(request.closed, INFINITE);
        ok = completed && request.ok;
        httpStatus = request.httpStatus;
        timedOut = (sent && !completed) || request.error == ERROR_WINHTTP_TIMEOUT;
        body = std::move(request.body);
    }
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    if (douyu) {
        // A metadata line precedes the untouched response body. Bilibili keeps
        // its existing stdout/exit protocol; only the new command uses framing.
        std::cout << "{\"httpStatus\":" << httpStatus << ",\"error\":"
            << (timedOut ? "\"timeout\"" : (!ok && (!httpStatus || httpStatus == 200) ? "\"network\"" : "null"))
            << "}\n";
        if (ok) std::cout << body;
        return 0;
    }
    if (ok) { std::cout << body; return 0; }
    std::cout << "{\"nativeError\":true}";
    return 1;
}
