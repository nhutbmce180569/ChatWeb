namespace WebAPI.Repositories;

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync();
}
