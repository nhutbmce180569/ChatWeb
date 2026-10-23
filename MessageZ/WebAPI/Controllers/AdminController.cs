using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebAPI.DTOs.Admin;
using WebAPI.Hubs;
using WebAPI.Models;
using WebAPI.Services;

namespace WebAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly RealtimeChatDbContext _context;
    private readonly IUserPresenceTracker _presenceTracker;

    public AdminController(RealtimeChatDbContext context, IUserPresenceTracker presenceTracker)
    {
        _context = context;
        _presenceTracker = presenceTracker;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetDashboardStats()
    {
        var totalUsers = await _context.Accounts.CountAsync();
        var activeUsers = await _context.Accounts.CountAsync(a => a.IsActive);
        var bannedUsers = await _context.Accounts.CountAsync(a => !a.IsActive);
        var totalAdmins = await _context.Accounts.CountAsync(a => a.Role == "Admin");
        var totalConversations = await _context.Conversations.CountAsync();
        var totalMessages = await _context.Messages.CountAsync();
        var onlineList = await _presenceTracker.GetOnlineUsersAsync();
        var onlineUsers = onlineList.Count;

        // Last 7 days registration trends
        var sevenDaysAgo = DateTime.UtcNow.Date.AddDays(-6);
        var recentAccounts = await _context.Accounts
            .Where(a => a.CreatedAt >= sevenDaysAgo)
            .GroupBy(a => a.CreatedAt.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync();

        var registrationStats = new List<DailyStatDto>();
        for (int i = 0; i < 7; i++)
        {
            var day = sevenDaysAgo.AddDays(i);
            var match = recentAccounts.FirstOrDefault(r => r.Date == day);
            registrationStats.Add(new DailyStatDto
            {
                Date = day.ToString("yyyy-MM-dd"),
                Count = match?.Count ?? 0
            });
        }

        var result = new AdminDashboardStatsDto
        {
            TotalUsers = totalUsers,
            ActiveUsers = activeUsers,
            BannedUsers = bannedUsers,
            TotalAdmins = totalAdmins,
            OnlineUsers = onlineUsers,
            TotalConversations = totalConversations,
            TotalMessages = totalMessages,
            RecentRegistrations = registrationStats
        };

        return Ok(result);
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] bool? isActive = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 15;

        var query = _context.Accounts
            .Include(a => a.User)
            .AsNoTracking()
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmedSearch = search.Trim();
            query = query.Where(a =>
                a.Email.Contains(trimmedSearch) ||
                (a.User != null && (a.User.Username.Contains(trimmedSearch) || a.User.DisplayName.Contains(trimmedSearch))));
        }

        if (!string.IsNullOrWhiteSpace(role) && !role.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(a => a.Role == role);
        }

        if (isActive.HasValue)
        {
            query = query.Where(a => a.IsActive == isActive.Value);
        }

        var totalCount = await query.CountAsync();

        var accounts = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = accounts.Select(a =>
        {
            var isOnline = a.User != null && _presenceTracker.IsUserOnline(a.User.Id);
            return new AdminUserDto
            {
                AccountId = a.Id,
                UserId = a.User?.Id ?? Guid.Empty,
                Username = a.User?.Username ?? "N/A",
                DisplayName = a.User?.DisplayName ?? "N/A",
                Email = a.Email,
                Role = a.Role,
                IsActive = a.IsActive,
                IsOnline = isOnline,
                AvatarUrl = a.User?.AvatarUrl,
                CreatedAt = a.CreatedAt,
                LastSeenAt = a.User?.LastSeenAt
            };
        }).ToList();

        var result = new PagedResult<AdminUserDto>
        {
            Items = items,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };

        return Ok(result);
    }

    [HttpPut("users/{accountId:guid}/status")]
    public async Task<IActionResult> UpdateUserStatus([FromRoute] Guid accountId, [FromBody] UpdateUserStatusRequest request)
    {
        var currentAccountIdStr = User.FindFirst("AccountId")?.Value;
        if (Guid.TryParse(currentAccountIdStr, out var currentAccountId) && currentAccountId == accountId && !request.IsActive)
        {
            return BadRequest(new { message = "You cannot deactivate or ban your own account." });
        }

        var account = await _context.Accounts.FirstOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return NotFound(new { message = "Account not found." });

        account.IsActive = request.IsActive;
        account.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = request.IsActive ? "User account has been activated." : "User account has been disabled/banned.",
            isActive = account.IsActive
        });
    }

    [HttpPut("users/{accountId:guid}/role")]
    public async Task<IActionResult> UpdateUserRole([FromRoute] Guid accountId, [FromBody] UpdateUserRoleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Role))
            return BadRequest(new { message = "Role is required." });

        var normalizedRole = request.Role.Trim();
        if (!normalizedRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) &&
            !normalizedRole.Equals("User", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Invalid role. Role must be 'Admin' or 'User'." });
        }

        // Standardize casing to 'Admin' or 'User'
        normalizedRole = normalizedRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) ? "Admin" : "User";

        var currentAccountIdStr = User.FindFirst("AccountId")?.Value;
        if (Guid.TryParse(currentAccountIdStr, out var currentAccountId) && currentAccountId == accountId && normalizedRole != "Admin")
        {
            return BadRequest(new { message = "You cannot remove your own Administrator privileges." });
        }

        var account = await _context.Accounts.FirstOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return NotFound(new { message = "Account not found." });

        account.Role = normalizedRole;
        account.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = $"User role updated to '{normalizedRole}'.",
            role = account.Role
        });
    }
}
