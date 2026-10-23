namespace WebAPI.Services;

public interface IEmailService
{
    Task SendEmailAsync(string toEmail, string subject, string htmlBody);
    Task SendPasswordResetOtpAsync(string toEmail, string otpCode, string? displayName = null);
}
