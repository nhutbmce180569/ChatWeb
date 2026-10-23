using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;

namespace WebAPI.Services.Implements;

public class OtpService : IOtpService
{
    private readonly IMemoryCache _cache;
    private readonly ILogger<OtpService> _logger;
    private const int OtpValidityMinutes = 5;
    private const int MaxFailedAttempts = 5;

    public class OtpEntry
    {
        public string Code { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public int FailedAttempts { get; set; } = 0;
        public bool IsVerified { get; set; } = false;
    }

    public OtpService(IMemoryCache cache, ILogger<OtpService> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    private static string GetCacheKey(string email) => $"pwd_otp:{email.Trim().ToLowerInvariant()}";

    public string GenerateAndStoreOtp(string email)
    {
        var key = GetCacheKey(email);
        
        // Generate secure 6-digit random code
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString("D6");

        var entry = new OtpEntry
        {
            Code = code,
            CreatedAt = DateTime.UtcNow,
            FailedAttempts = 0,
            IsVerified = false
        };

        var cacheEntryOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(OtpValidityMinutes));

        _cache.Set(key, entry, cacheEntryOptions);
        _logger.LogInformation("Generated OTP for {Email}, expires in {Minutes} minutes", email, OtpValidityMinutes);

        return code;
    }

    public bool VerifyOtp(string email, string code, out string? errorMessage)
    {
        errorMessage = null;
        var key = GetCacheKey(email);

        if (!_cache.TryGetValue(key, out OtpEntry? entry) || entry == null)
        {
            errorMessage = "The OTP code has expired or was not requested. Please request a new code.";
            return false;
        }

        if (entry.FailedAttempts >= MaxFailedAttempts)
        {
            _cache.Remove(key);
            errorMessage = "Too many incorrect attempts. For security, please request a new OTP.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(code) || entry.Code != code.Trim())
        {
            entry.FailedAttempts++;
            _cache.Set(key, entry, new MemoryCacheEntryOptions().SetAbsoluteExpiration(TimeSpan.FromMinutes(OtpValidityMinutes)));

            var remaining = MaxFailedAttempts - entry.FailedAttempts;
            errorMessage = remaining > 0
                ? $"Invalid OTP code. {remaining} attempt(s) remaining."
                : "Too many incorrect attempts. For security, please request a new OTP.";
            return false;
        }

        // Correct OTP
        entry.IsVerified = true;
        // Extend expiration for 10 minutes to allow user to complete reset password form
        _cache.Set(key, entry, new MemoryCacheEntryOptions().SetAbsoluteExpiration(TimeSpan.FromMinutes(10)));
        return true;
    }

    public bool IsOtpVerified(string email)
    {
        var key = GetCacheKey(email);
        return _cache.TryGetValue(key, out OtpEntry? entry) && entry != null && entry.IsVerified;
    }

    public void ClearOtp(string email)
    {
        var key = GetCacheKey(email);
        _cache.Remove(key);
    }
}
