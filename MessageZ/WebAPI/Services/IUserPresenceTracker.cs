using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace WebAPI.Services;

public interface IUserPresenceTracker
{
    /// <summary>
    /// Registers a connection for a user.
    /// Returns true if this is the user's first connection (user transitioned from offline to online).
    /// </summary>
    Task<bool> UserConnectedAsync(Guid userId, string connectionId);

    /// <summary>
    /// Unregisters a connection for a user.
    /// Returns a tuple: (isOffline: true if user has 0 connections remaining, lastSeenAt: Utc timestamp).
    /// </summary>
    Task<(bool isOffline, DateTime lastSeenAt)> UserDisconnectedAsync(Guid userId, string connectionId);

    /// <summary>
    /// Checks if a user is currently online.
    /// </summary>
    bool IsUserOnline(Guid userId);

    /// <summary>
    /// Gets all currently connected user IDs.
    /// </summary>
    Task<IReadOnlyCollection<Guid>> GetOnlineUsersAsync();

    /// <summary>
    /// Gets all active connection IDs for a specific user.
    /// </summary>
    Task<IReadOnlyCollection<string>> GetConnectionsForUserAsync(Guid userId);
}
