using AutoMapper;
using WebAPI.Models;
using WebAPI.DTOs.Auth;

namespace WebAPI.Mappers;

public class AuthMapperProfile : Profile
{
    public AuthMapperProfile()
    {
        CreateMap<User, UserDto>();
        CreateMap<RegisterRequest, Account>()
            .ForMember(dest => dest.PasswordHash, opt => opt.Ignore());
        CreateMap<RegisterRequest, User>();
    }
}
