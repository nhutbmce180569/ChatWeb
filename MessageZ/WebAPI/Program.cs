using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using WebAPI.Mappers;
using WebAPI.Models;
using WebAPI.Repositories;
using WebAPI.Repositories.Implements;
using WebAPI.Services;
using WebAPI.Services.Implements;
using WebAPI.Hubs;
using CloudinaryDotNet;

namespace WebAPI
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();
            
            // Configure DbContext
            builder.Services.AddDbContext<RealtimeChatDbContext>(options =>
                options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

            // Add AutoMapper
            builder.Services.AddAutoMapper(mc =>
            {
                mc.AddProfile(new AuthMapperProfile());
            });

            // Add Repositories & Services
            builder.Services.AddScoped<IAccountRepository, AccountRepository>();
            builder.Services.AddScoped<IUserRepository, UserRepository>();
            builder.Services.AddScoped<IConversationRepository, ConversationRepository>();
            builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
            builder.Services.AddScoped<IAuthService, AuthService>();
            builder.Services.AddScoped<IConversationService, ConversationService>();

            // Configure Cloudinary & PhotoService
            var cloudinaryUrl = builder.Configuration["Cloudinary:URL"];
            if (!string.IsNullOrWhiteSpace(cloudinaryUrl))
            {
                if (cloudinaryUrl.StartsWith("CLOUDINARY_URL="))
                {
                    cloudinaryUrl = cloudinaryUrl.Substring("CLOUDINARY_URL=".Length);
                }
                cloudinaryUrl = cloudinaryUrl.Replace(">", "").Trim();
            }
            var cloudinary = new Cloudinary(cloudinaryUrl);
            cloudinary.Api.Secure = true;
            builder.Services.AddSingleton(cloudinary);
            builder.Services.AddScoped<IPhotoService, PhotoService>();
            builder.Services.AddScoped<IFileService, FileService>();
            builder.Services.AddSingleton<IUserPresenceTracker, InMemoryPresenceTracker>();
            
            // Add SignalR
            builder.Services.AddSignalR();
            builder.Services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, WebAPI.Hubs.CustomUserIdProvider>();

            // Configure JWT Authentication
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        ValidIssuer = builder.Configuration["Jwt:Issuer"],
                        ValidAudience = builder.Configuration["Jwt:Audience"],
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
                    };
                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            var accessToken = context.Request.Query["access_token"];
                            var path = context.HttpContext.Request.Path;
                            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/chatHub"))
                            {
                                context.Token = accessToken;
                            }
                            return Task.CompletedTask;
                        }
                    };
                });

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            // Configure CORS
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAll", builder =>
                {
                    builder.WithOrigins("https://localhost:7265", "http://localhost:5036") // WebMVC ports
                           .SetIsOriginAllowed(origin => true) // allow any origin
                           .AllowAnyMethod()
                           .AllowAnyHeader()
                           .AllowCredentials();
                });
            });

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.UseHttpsRedirection();
            app.UseCors("AllowAll");

            app.UseAuthentication();
            app.UseAuthorization();


            app.MapControllers();
            app.MapHub<ChatHub>("/chatHub");

            app.Run();
        }
    }
}
