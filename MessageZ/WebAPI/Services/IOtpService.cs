namespace WebAPI.Services;

public interface IOtpService
{
    string GenerateAndStoreOtp(string email);
    bool VerifyOtp(string email, string code, out string? errorMessage);
    bool IsOtpVerified(string email);
    void ClearOtp(string email);
}
