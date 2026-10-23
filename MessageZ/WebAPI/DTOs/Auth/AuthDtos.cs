using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.Auth;

public class LoginRequest
{
    [Required] [EmailAddress] public string Email { get; set; } = null!;
    [Required] public string Password { get; set; } = null!;
}

public class LoginResponse
{
    public string Token { get; set; } = null!;
    public UserDto User { get; set; } = null!;
}

public class UserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public string Role { get; set; } = "User";
}

public class RegisterRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email address format.")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "Password is required.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long.")]
    [RegularExpression(@"^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$",
        ErrorMessage = "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.")]
    public string Password { get; set; } = null!;

    [Required(ErrorMessage = "Username is required.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters.")]
    [RegularExpression(@"^[a-zA-Z0-9_.-]+$", ErrorMessage = "Username can only contain letters, numbers, underscores, and dots.")]
    public string Username { get; set; } = null!;

    [Required(ErrorMessage = "Display name is required.")]
    [StringLength(100, ErrorMessage = "Display name cannot exceed 100 characters.")]
    public string DisplayName { get; set; } = null!;
}

public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email address format.")]
    public string Email { get; set; } = null!;
}

public class VerifyOtpRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email address format.")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "OTP code is required.")]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "OTP code must be a 6-digit number.")]
    public string Otp { get; set; } = null!;
}

public class ResetPasswordRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email address format.")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "OTP code is required.")]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "OTP code must be a 6-digit number.")]
    public string Otp { get; set; } = null!;

    [Required(ErrorMessage = "Password is required.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long.")]
    [RegularExpression(@"^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$",
        ErrorMessage = "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.")]
    public string NewPassword { get; set; } = null!;
}

public class AuthResult<T>
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? ErrorField { get; set; }
    public T? Data { get; set; }

    public static AuthResult<T> Ok(T data) => new() { Success = true, Data = data };
    public static AuthResult<T> Fail(string error, string? field = null) => new() { Success = false, ErrorMessage = error, ErrorField = field };
}
