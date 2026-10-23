using AutoMapper;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using WebAPI.DTOs.Auth;
using WebAPI.Models;
using WebAPI.Repositories;

namespace WebAPI.Services.Implements;

public class AuthService : IAuthService
{
    private readonly IAccountRepository _accountRepository;
    private readonly IUserRepository _userRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;
    private readonly IMapper _mapper;
    private readonly IEmailService _emailService;
    private readonly IOtpService _otpService;

    public AuthService(
        IAccountRepository accountRepository,
        IUserRepository userRepository,
        IUnitOfWork unitOfWork,
        IConfiguration configuration,
        IMapper mapper,
        IEmailService emailService,
        IOtpService otpService)
    {
        _accountRepository = accountRepository;
        _userRepository = userRepository;
        _unitOfWork = unitOfWork;
        _configuration = configuration;
        _mapper = mapper;
        _emailService = emailService;
        _otpService = otpService;
    }

    public async Task<AuthResult<LoginResponse>> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var account = await _accountRepository.GetByEmailAsync(normalizedEmail);
        if (account == null)
            return AuthResult<LoginResponse>.Fail("Invalid email or password.");

        if (!account.IsActive)
            return AuthResult<LoginResponse>.Fail("Your account has been disabled.");

        bool isPasswordValid = BCrypt.Net.BCrypt.Verify(request.Password, account.PasswordHash);
        if (!isPasswordValid)
            return AuthResult<LoginResponse>.Fail("Invalid email or password.");

        var token = GenerateJwtToken(account);
        var userDto = _mapper.Map<UserDto>(account.User);
        userDto.Role = account.Role;

        return AuthResult<LoginResponse>.Ok(new LoginResponse
        {
            Token = token,
            User = userDto
        });
    }

    public async Task<AuthResult<string>> RegisterAsync(RegisterRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (await _accountRepository.ExistsByEmailAsync(normalizedEmail))
            return AuthResult<string>.Fail("Email is already registered.", "Email");

        var normalizedUsername = request.Username.Trim();
        if (await _userRepository.ExistsByUsernameAsync(normalizedUsername))
            return AuthResult<string>.Fail("Username is already taken.", "Username");

        if (string.IsNullOrWhiteSpace(request.Password) ||
            request.Password.Length < 8 ||
            !request.Password.Any(char.IsUpper) ||
            !request.Password.Any(char.IsDigit) ||
            !request.Password.Any(ch => !char.IsLetterOrDigit(ch)))
        {
            return AuthResult<string>.Fail(
                "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.",
                "Password");
        }

        var account = _mapper.Map<Account>(request);
        account.Email = normalizedEmail;
        account.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        account.Role = "User";
        account.IsActive = true;

        var user = _mapper.Map<User>(request);
        user.Username = normalizedUsername;
        user.DisplayName = request.DisplayName.Trim();
        user.Account = account;

        await _accountRepository.AddAsync(account);
        await _userRepository.AddAsync(user);
        
        await _unitOfWork.SaveChangesAsync();

        return AuthResult<string>.Ok("Registration successful.");
    }

    public async Task<AuthResult<string>> ForgotPasswordAsync(ForgotPasswordRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var account = await _accountRepository.GetByEmailAsync(normalizedEmail);
        if (account == null)
            return AuthResult<string>.Fail("No account found with this email address.", "Email");

        if (!account.IsActive)
            return AuthResult<string>.Fail("Your account has been disabled.", "Email");

        var otp = _otpService.GenerateAndStoreOtp(normalizedEmail);
        var displayName = account.User?.DisplayName ?? account.User?.Username;

        try
        {
            await _emailService.SendPasswordResetOtpAsync(account.Email, otp, displayName);
        }
        catch (Exception)
        {
            return AuthResult<string>.Fail("Failed to send OTP email. Please try again later.");
        }

        return AuthResult<string>.Ok("An OTP code has been sent to your email.");
    }

    public Task<AuthResult<string>> VerifyOtpAsync(VerifyOtpRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!_otpService.VerifyOtp(normalizedEmail, request.Otp, out var errorMessage))
        {
            return Task.FromResult(AuthResult<string>.Fail(errorMessage ?? "Invalid OTP code.", "Otp"));
        }

        return Task.FromResult(AuthResult<string>.Ok("OTP verified successfully."));
    }

    public async Task<AuthResult<string>> ResetPasswordAsync(ResetPasswordRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        // Verify OTP
        if (!_otpService.VerifyOtp(normalizedEmail, request.Otp, out var errorMessage))
        {
            return AuthResult<string>.Fail(errorMessage ?? "Invalid or expired OTP code.", "Otp");
        }

        // Validate password format
        if (string.IsNullOrWhiteSpace(request.NewPassword) ||
            request.NewPassword.Length < 8 ||
            !request.NewPassword.Any(char.IsUpper) ||
            !request.NewPassword.Any(char.IsDigit) ||
            !request.NewPassword.Any(ch => !char.IsLetterOrDigit(ch)))
        {
            return AuthResult<string>.Fail(
                "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.",
                "NewPassword");
        }

        var account = await _accountRepository.GetByEmailAsync(normalizedEmail);
        if (account == null)
            return AuthResult<string>.Fail("Account not found.");

        account.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        account.UpdatedAt = DateTime.UtcNow;

        _accountRepository.Update(account);
        await _unitOfWork.SaveChangesAsync();

        _otpService.ClearOtp(normalizedEmail);

        return AuthResult<string>.Ok("Password has been reset successfully. You can now login with your new password.");
    }

    private string GenerateJwtToken(Account account)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, account.User!.Id.ToString()),
            new Claim(ClaimTypes.Name, account.User.Username),
            new Claim(ClaimTypes.Email, account.Email),
            new Claim("AccountId", account.Id.ToString()),
            new Claim(ClaimTypes.Role, account.Role),
            new Claim("role", account.Role)
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddDays(7),
            Issuer = _configuration["Jwt:Issuer"],
            Audience = _configuration["Jwt:Audience"],
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }
}
