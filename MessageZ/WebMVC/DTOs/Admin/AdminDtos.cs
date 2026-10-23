namespace WebMVC.DTOs.Admin;

public class AdminDashboardStatsDto
{
    public int TotalUsers { get; set; }
    public int ActiveUsers { get; set; }
    public int BannedUsers { get; set; }
    public int TotalAdmins { get; set; }
    public int OnlineUsers { get; set; }
    public int TotalConversations { get; set; }
    public int TotalMessages { get; set; }
    public List<DailyStatDto> RecentRegistrations { get; set; } = new();
}

public class DailyStatDto
{
    public string Date { get; set; } = null!;
    public int Count { get; set; }
}

public class AdminUserDto
{
    public Guid AccountId { get; set; }
    public Guid UserId { get; set; }
    public string Username { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Role { get; set; } = "User";
    public bool IsActive { get; set; }
    public bool IsOnline { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }
}

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / (PageSize > 0 ? PageSize : 1));
}

public class AdminDashboardViewModel
{
    public AdminDashboardStatsDto Stats { get; set; } = new();
    public PagedResult<AdminUserDto> Users { get; set; } = new();
    public string? Search { get; set; }
    public string? RoleFilter { get; set; }
    public string? StatusFilter { get; set; }
}
