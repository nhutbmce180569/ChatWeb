using WebAPI.Models;

namespace WebAPI.Repositories;

public interface IAccountRepository
{
    Task<Account?> GetByEmailAsync(string email);
    Task<bool> ExistsByEmailAsync(string email);
    Task AddAsync(Account account);
    void Update(Account account);
}
