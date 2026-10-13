using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.User;

public class UserProfileDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UpdateProfileRequest
{
    [Required(ErrorMessage = "Display name is required.")]
    [StringLength(100, MinimumLength = 2, ErrorMessage = "Display name must be between 2 and 100 characters.")]
    public string DisplayName { get; set; } = null!;
}

public class AvatarUploadRequest
{
    [Required(ErrorMessage = "Please select an image file.")]
    public IFormFile File { get; set; } = null!;
}

public class UpdateProfileFormRequest
{
    [Required(ErrorMessage = "Display name is required.")]
    [StringLength(100, MinimumLength = 2, ErrorMessage = "Display name must be between 2 and 100 characters.")]
    public string DisplayName { get; set; } = null!;

    public IFormFile? Avatar { get; set; }
}
