using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WebAPI.Services.Implements;

public class InMemoryPresenceTracker : IUserPresenceTracker
{
    // Mapping from UserId -> Set of ConnectionIds
    private readonly ConcurrentDictionary<Guid, HashSet<string>> _onlineUsers = new();

    public Task<bool> UserConnectedAsync(Guid userId, string connectionId)
    {
        bool isFirstConnection = false;

        _onlineUsers.AddOrUpdate(
            userId,
            _ =>
            {
                isFirstConnection = true;
                return new HashSet<string> { connectionId };
            },
            (_, connections) =>
            {
                lock (connections)
                {
                    if (connections.Count == 0)
                    {
                        isFirstConnection = true;
                    }
                    connections.Add(connectionId);
                }
                return connections;
            });

        return Task.FromResult(isFirstConnection);
    }

    public Task<(bool isOffline, DateTime lastSeenAt)> UserDisconnectedAsync(Guid userId, string connectionId)
    {
        bool isOffline = false;
        var now = DateTime.UtcNow;

        if (_onlineUsers.TryGetValue(userId, out var connections))
        {
            lock (connections)
            {
                connections.Remove(connectionId);
                if (connections.Count == 0)
                {
                    isOffline = true;
                }
            }

            if (isOffline)
            {
                _onlineUsers.TryRemove(userId, out _);
            }
        }

        return Task.FromResult((isOffline, now));
    }

    public bool IsUserOnline(Guid userId)
    {
        if (_onlineUsers.TryGetValue(userId, out var connections))
        {
            lock (connections)
            {
                return connections.Count > 0;
            }
        }
        return false;
    }

    public Task<IReadOnlyCollection<Guid>> GetOnlineUsersAsync()
    {
        var onlineList = _onlineUsers
            .Where(kvp =>
            {
                lock (kvp.Value)
                {
                    return kvp.Value.Count > 0;
                }
            })
            .Select(kvp => kvp.Key)
            .ToList();

        return Task.FromResult<IReadOnlyCollection<Guid>>(onlineList);
    }

    public Task<IReadOnlyCollection<string>> GetConnectionsForUserAsync(Guid userId)
    {
        if (_onlineUsers.TryGetValue(userId, out var connections))
        {
            lock (connections)
            {
                return Task.FromResult<IReadOnlyCollection<string>>(connections.ToList());
            }
        }

        return Task.FromResult<IReadOnlyCollection<string>>(Array.Empty<string>());
    }
}
