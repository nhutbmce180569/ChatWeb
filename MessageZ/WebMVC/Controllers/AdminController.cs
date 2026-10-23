using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebMVC.DTOs.Admin;
using WebMVC.Services;

namespace WebMVC.Controllers;

[Authorize(Roles = "Admin")]
public class AdminController : Controller
{
    private readonly IAdminApiClient _adminApiClient;

    public AdminController(IAdminApiClient adminApiClient)
    {
        _adminApiClient = adminApiClient;
    }

    [HttpGet]
    public IActionResult Index()
    {
        return RedirectToAction(nameof(Dashboard));
    }

    [HttpGet]
    public async Task<IActionResult> Dashboard(
        string? search = null,
        string? role = null,
        string? status = null,
        int page = 1)
    {
        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
        {
            TempData["ErrorMessage"] = "Session expired. Please sign in again.";
            return RedirectToAction("Login", "Auth");
        }

        bool? isActive = null;
        if (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase))
            isActive = true;
        else if (string.Equals(status, "Disabled", StringComparison.OrdinalIgnoreCase) || string.Equals(status, "Banned", StringComparison.OrdinalIgnoreCase))
            isActive = false;

        var statsTask = _adminApiClient.GetStatsAsync(token);
        var usersTask = _adminApiClient.GetUsersAsync(token, search, role, isActive, page, 15);

        await Task.WhenAll(statsTask, usersTask);

        var viewModel = new AdminDashboardViewModel
        {
            Stats = await statsTask ?? new AdminDashboardStatsDto(),
            Users = await usersTask ?? new PagedResult<AdminUserDto>(),
            Search = search,
            RoleFilter = string.IsNullOrWhiteSpace(role) ? "All" : role,
            StatusFilter = string.IsNullOrWhiteSpace(status) ? "All" : status
        };

        return View(viewModel);
    }

    public class StatusActionModel
    {
        public Guid AccountId { get; set; }
        public bool IsActive { get; set; }
    }

    [HttpPost]
    public async Task<IActionResult> UpdateStatus([FromBody] StatusActionModel? jsonModel, [FromForm] Guid? accountId, [FromForm] bool? isActive)
    {
        var targetId = jsonModel?.AccountId ?? accountId ?? Guid.Empty;
        var activeVal = jsonModel?.IsActive ?? isActive ?? true;

        if (targetId == Guid.Empty)
            return BadRequest(new { success = false, message = "Invalid Account ID." });

        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { success = false, message = "Unauthorized." });

        var (success, message) = await _adminApiClient.UpdateUserStatusAsync(token, targetId, activeVal);

        if (Request.Headers["Accept"].ToString().Contains("application/json") || Request.Headers["X-Requested-With"] == "XMLHttpRequest")
        {
            return Json(new { success, message });
        }

        if (success)
            TempData["SuccessMessage"] = message ?? "User status updated successfully.";
        else
            TempData["ErrorMessage"] = message ?? "Failed to update user status.";

        return RedirectToAction(nameof(Dashboard));
    }

    public class RoleActionModel
    {
        public Guid AccountId { get; set; }
        public string Role { get; set; } = "User";
    }

    [HttpPost]
    public async Task<IActionResult> UpdateRole([FromBody] RoleActionModel? jsonModel, [FromForm] Guid? accountId, [FromForm] string? role)
    {
        var targetId = jsonModel?.AccountId ?? accountId ?? Guid.Empty;
        var roleVal = jsonModel?.Role ?? role ?? "User";

        if (targetId == Guid.Empty)
            return BadRequest(new { success = false, message = "Invalid Account ID." });

        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { success = false, message = "Unauthorized." });

        var (success, message) = await _adminApiClient.UpdateUserRoleAsync(token, targetId, roleVal);

        if (Request.Headers["Accept"].ToString().Contains("application/json") || Request.Headers["X-Requested-With"] == "XMLHttpRequest")
        {
            return Json(new { success, message });
        }

        if (success)
            TempData["SuccessMessage"] = message ?? "User role updated successfully.";
        else
            TempData["ErrorMessage"] = message ?? "Failed to update user role.";

        return RedirectToAction(nameof(Dashboard));
    }
}
