using WebMVC.DTOs.Admin;

namespace WebMVC.Services;

public interface IAdminApiClient
{
    Task<AdminDashboardStatsDto?> GetStatsAsync(string token);
    Task<PagedResult<AdminUserDto>?> GetUsersAsync(string token, string? search = null, string? role = null, bool? isActive = null, int page = 1, int pageSize = 15);
    Task<(bool Success, string? Message)> UpdateUserStatusAsync(string token, Guid accountId, bool isActive);
    Task<(bool Success, string? Message)> UpdateUserRoleAsync(string token, Guid accountId, string role);
}
