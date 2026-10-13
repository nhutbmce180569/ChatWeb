using WebAPI.Models;

namespace WebAPI.Repositories.Implements;

public class UnitOfWork : IUnitOfWork
{
    private readonly RealtimeChatDbContext _context;

    public UnitOfWork(RealtimeChatDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync()
    {
        return await _context.SaveChangesAsync();
    }
}
