using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace WebMVC.DTOs.User;

public class UserProfileDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UpdateProfileViewModel
{
    [Required(ErrorMessage = "Display name is required.")]
    [StringLength(100, MinimumLength = 2, ErrorMessage = "Display name must be between 2 and 100 characters.")]
    [Display(Name = "Display Name")]
    public string DisplayName { get; set; } = null!;

    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime? CreatedAt { get; set; }

    public IFormFile? AvatarFile { get; set; }
}
