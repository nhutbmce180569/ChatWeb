using Microsoft.EntityFrameworkCore;
using WebAPI.Models;

namespace WebAPI.Repositories.Implements;

public class AccountRepository : IAccountRepository
{
    private readonly RealtimeChatDbContext _context;

    public AccountRepository(RealtimeChatDbContext context)
    {
        _context = context;
    }

    public async Task<Account?> GetByEmailAsync(string email)
    {
        return await _context.Accounts
            .Include(a => a.User)
            .FirstOrDefaultAsync(a => a.Email == email);
    }

    public async Task<bool> ExistsByEmailAsync(string email)
    {
        return await _context.Accounts.AnyAsync(a => a.Email == email);
    }

    public async Task AddAsync(Account account)
    {
        await _context.Accounts.AddAsync(account);
    }

    public void Update(Account account)
    {
        _context.Accounts.Update(account);
    }
}
