using WebAPI.Models;

namespace WebAPI.Repositories;

public interface IUserRepository
{
    Task<bool> ExistsByUsernameAsync(string username);
    Task AddAsync(User user);
    Task<User?> GetByIdAsync(Guid id);
    Task<List<User>> GetUsersByIdsAsync(IEnumerable<Guid> ids);
}
