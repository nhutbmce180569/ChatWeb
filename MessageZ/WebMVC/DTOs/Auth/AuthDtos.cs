using System.ComponentModel.DataAnnotations;

namespace WebMVC.DTOs.Auth;

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
}

public class RegisterRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters.")]
    [RegularExpression(@"^[a-zA-Z0-9_.-]+$", ErrorMessage = "Username can only contain letters, numbers, underscores, and dots.")]
    public string Username { get; set; } = null!;

    [Required(ErrorMessage = "Display name is required.")]
    [StringLength(100, ErrorMessage = "Display name cannot exceed 100 characters.")]
    public string DisplayName { get; set; } = null!;

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email address format.")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "Password is required.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long.")]
    [RegularExpression(@"^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$",
        ErrorMessage = "Password must contain at least one uppercase letter, one number, and one special character.")]
    [DataType(DataType.Password)]
    public string Password { get; set; } = null!;

    [Required(ErrorMessage = "Please confirm your password.")]
    [DataType(DataType.Password)]
    [Compare("Password", ErrorMessage = "Passwords do not match.")]
    [Display(Name = "Confirm Password")]
    public string ConfirmPassword { get; set; } = null!;
}

public class AuthActionResult
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public string? Field { get; set; }
    public Dictionary<string, string[]>? ValidationErrors { get; set; }
}

public class LoginActionResult
{
    public bool Success { get; set; }
    public LoginResponse? Data { get; set; }
    public string? ErrorMessage { get; set; }
}
