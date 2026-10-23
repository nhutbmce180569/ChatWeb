using System.Net;
using System.Net.Mail;

namespace WebAPI.Services.Implements;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string htmlBody)
    {
        var smtpServer = _configuration["EmailSettings:SmtpServer"] ?? "smtp.gmail.com";
        var portStr = _configuration["EmailSettings:Port"] ?? "587";
        int.TryParse(portStr, out int port);
        if (port == 0) port = 587;

        var senderEmail = _configuration["EmailSettings:SenderEmail"] ?? "nhutbuist949@gmail.com";
        var senderName = _configuration["EmailSettings:SenderDisplayName"] ?? "MessageZ Support";
        
        var password = _configuration["EmailSettings:Password"] 
                       ?? _configuration["EmailSettings:AppPassword"] 
                       ?? _configuration["Google:Password"] 
                       ?? string.Empty;

        // Clean spaces from Google App Password if present
        password = password.Replace(" ", "").Trim();

        using var message = new MailMessage
        {
            From = new MailAddress(senderEmail, senderName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        message.To.Add(new MailAddress(toEmail));

        using var client = new SmtpClient(smtpServer, port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(senderEmail, password)
        };

        try
        {
            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent successfully to {ToEmail} with subject '{Subject}'", toEmail, subject);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {ToEmail}", toEmail);
            throw new InvalidOperationException($"Failed to send email: {ex.Message}", ex);
        }
    }

    public async Task SendPasswordResetOtpAsync(string toEmail, string otpCode, string? displayName = null)
    {
        var greeting = string.IsNullOrWhiteSpace(displayName) ? "Hello" : $"Hello {displayName}";
        var subject = $"[MessageZ] {otpCode} is your password reset code";

        var htmlBody = $@"
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Password Reset OTP</title>
</head>
<body style=""margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;"">
    <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" style=""background-color:#0b0f19;padding:40px 15px;"">
        <tr>
            <td align=""center"">
                <table role=""presentation"" width=""100%"" style=""max-width:520px;background-color:#131b2e;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);"" cellspacing=""0"" cellpadding=""0"">
                    <!-- Header -->
                    <tr>
                        <td style=""padding:32px 32px 20px 32px;text-align:center;border-bottom:1px solid #1e293b;"">
                            <div style=""display:inline-flex;align-items:center;gap:10px;"">
                                <span style=""font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;"">Message<span style=""color:#6366f1;"">Z</span></span>
                            </div>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style=""padding:32px;"">
                            <h2 style=""margin:0 0 16px 0;font-size:20px;font-weight:700;color:#f8fafc;"">Password Reset Request</h2>
                            <p style=""margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#94a3b8;"">
                                {greeting},
                            </p>
                            <p style=""margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#94a3b8;"">
                                We received a request to reset your password for your MessageZ account. Use the following One-Time Password (OTP) verification code:
                            </p>
                            
                            <!-- OTP Box -->
                            <div style=""margin:28px 0;padding:20px;background-color:#0b0f19;border:1px dashed #6366f1;border-radius:12px;text-align:center;"">
                                <span style=""font-family:Consolas,Monaco,'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#818cf8;display:inline-block;padding-left:10px;"">
                                    {otpCode}
                                </span>
                            </div>

                            <p style=""margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#f59e0b;"">
                                &#9888; <strong>Important:</strong> This OTP code is valid for <strong>5 minutes</strong>. Never share this code with anyone.
                            </p>
                            <p style=""margin:0;font-size:13px;line-height:1.6;color:#64748b;"">
                                If you did not request a password reset, you can safely disregard this email. Your password will remain unchanged.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style=""padding:20px 32px;background-color:#0f172a;border-top:1px solid #1e293b;text-align:center;"">
                            <p style=""margin:0;font-size:12px;color:#475569;"">
                                &copy; 2026 MessageZ Inc. All rights reserved. &bull; Automated security message
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>";

        await SendEmailAsync(toEmail, subject, htmlBody);
    }
}
