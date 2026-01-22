export interface ApiError {
    message?: string;
    exc_type?: string;
    _server_messages?: string;
}

export const handleApiError = (error: any): string => {
    console.error("API Error:", error);
    if (error?.response?.data?._server_messages) {
        try {
            const serverMessages = JSON.parse(error.response.data._server_messages);
            const parsedMessage = JSON.parse(serverMessages[0]);
            return parsedMessage.message || "Something went wrong";
        } catch {
            return "Server error occurred";
        }
    }

    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.message) {
        return error.message;
    }
    return "Unexpected error occurred. Please try again.";
};
