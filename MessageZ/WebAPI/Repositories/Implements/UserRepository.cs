using Microsoft.EntityFrameworkCore;
using WebAPI.Models;

namespace WebAPI.Repositories.Implements;

public class UserRepository : IUserRepository
{
    private readonly RealtimeChatDbContext _context;

    public UserRepository(RealtimeChatDbContext context)
    {
        _context = context;
    }

    public async Task<bool> ExistsByUsernameAsync(string username)
    {
        return await _context.Users.AnyAsync(u => u.Username == username);
    }

    public async Task AddAsync(User user)
    {
        await _context.Users.AddAsync(user);
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        return await _context.Users.FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<List<User>> GetUsersByIdsAsync(IEnumerable<Guid> ids)
    {
        return await _context.Users.Where(u => ids.Contains(u.Id)).ToListAsync();
    }
}
