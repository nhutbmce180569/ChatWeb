using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebAPI.DTOs.User;
using WebAPI.Models;
using WebAPI.Services;

namespace WebAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class UserController : ControllerBase
{
    private readonly RealtimeChatDbContext _context;
    private readonly IPhotoService _photoService;

    public UserController(RealtimeChatDbContext context, IPhotoService photoService)
    {
        _context = context;
        _photoService = photoService;
    }

    [HttpGet]
    public async Task<IActionResult> GetUsers([FromQuery] string? query = null)
    {
        var usersQuery = _context.Users.AsQueryable();

        if (!string.IsNullOrEmpty(query))
        {
            usersQuery = usersQuery.Where(u => u.DisplayName.Contains(query) || u.Username.Contains(query));
        }

        var users = await usersQuery
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.DisplayName,
                u.AvatarUrl
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Invalid authentication token." });

        var user = await _context.Users
            .Include(u => u.Account)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return NotFound(new { message = "User not found." });

        return Ok(new UserProfileDto
        {
            Id = user.Id,
            Username = user.Username,
            DisplayName = user.DisplayName,
            Email = user.Account?.Email ?? string.Empty,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt
        });
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Invalid authentication token." });

        var user = await _context.Users
            .Include(u => u.Account)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return NotFound(new { message = "User not found." });

        user.DisplayName = request.DisplayName.Trim();
        await _context.SaveChangesAsync();

        return Ok(new UserProfileDto
        {
            Id = user.Id,
            Username = user.Username,
            DisplayName = user.DisplayName,
            Email = user.Account?.Email ?? string.Empty,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt
        });
    }

    [HttpPost("avatar")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadAvatar([FromForm] AvatarUploadRequest request)
    {
        if (request.File == null || request.File.Length == 0)
            return BadRequest(new { message = "Please select an image file to upload." });

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Invalid authentication token." });

        var user = await _context.Users
            .Include(u => u.Account)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return NotFound(new { message = "User not found." });

        var oldAvatarUrl = user.AvatarUrl;

        // Upload directly to Cloudinary folder "messagez/avatars"
        var uploadResult = await _photoService.UploadImageAsync(request.File, "messagez/avatars");
        if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
        {
            return BadRequest(new { message = uploadResult.ErrorMessage ?? "Failed to upload avatar to Cloudinary." });
        }

        user.AvatarUrl = uploadResult.Url;
        await _context.SaveChangesAsync();

        // Delete old avatar from Cloudinary if previously set
        if (!string.IsNullOrWhiteSpace(oldAvatarUrl) && !string.Equals(oldAvatarUrl, uploadResult.Url, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                await _photoService.DeleteImageAsync(oldAvatarUrl);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Delete Old Avatar Warning]: Failed to delete {oldAvatarUrl}. {ex.Message}");
            }
        }

        return Ok(new
        {
            message = "Avatar updated successfully.",
            avatarUrl = user.AvatarUrl,
            user = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                DisplayName = user.DisplayName,
                Email = user.Account?.Email ?? string.Empty,
                AvatarUrl = user.AvatarUrl,
                CreatedAt = user.CreatedAt
            }
        });
    }

    [HttpPut("profile-form")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UpdateProfileForm([FromForm] UpdateProfileFormRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Trim().Length < 2 || request.DisplayName.Trim().Length > 100)
            return BadRequest(new { message = "Display name must be between 2 and 100 characters." });

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Invalid authentication token." });

        var user = await _context.Users
            .Include(u => u.Account)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return NotFound(new { message = "User not found." });

        user.DisplayName = request.DisplayName.Trim();

        string? oldAvatarUrl = null;
        if (request.Avatar != null && request.Avatar.Length > 0)
        {
            var uploadResult = await _photoService.UploadImageAsync(request.Avatar, "messagez/avatars");
            if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
            {
                return BadRequest(new { message = uploadResult.ErrorMessage ?? "Failed to upload avatar to Cloudinary." });
            }
            oldAvatarUrl = user.AvatarUrl;
            user.AvatarUrl = uploadResult.Url;
        }

        await _context.SaveChangesAsync();

        // Delete old avatar from Cloudinary if replaced
        if (!string.IsNullOrWhiteSpace(oldAvatarUrl) && !string.Equals(oldAvatarUrl, user.AvatarUrl, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                await _photoService.DeleteImageAsync(oldAvatarUrl);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Delete Old Avatar Warning]: Failed to delete {oldAvatarUrl}. {ex.Message}");
            }
        }

        return Ok(new UserProfileDto
        {
            Id = user.Id,
            Username = user.Username,
            DisplayName = user.DisplayName,
            Email = user.Account?.Email ?? string.Empty,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt
        });
    }
}
