using Microsoft.AspNetCore.Authentication.Cookies;
using WebMVC.Services;
using WebMVC.Services.Implements;

namespace WebMVC
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var baseDir = AppContext.BaseDirectory;
            var projectDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", ".."));
            var contentRoot = (Directory.Exists(Path.Combine(projectDir, "Views")))
                ? projectDir
                : Directory.GetCurrentDirectory();

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                ContentRootPath = contentRoot
            });

            // Add services to the container.
            builder.Services.AddControllersWithViews();

            // Add Authentication
            builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(options =>
                {
                    options.LoginPath = "/Auth/Login";
                    options.LogoutPath = "/Auth/Logout";
                    options.AccessDeniedPath = "/Home/Index";
                    options.ExpireTimeSpan = TimeSpan.FromDays(7);
                });

            // Add Http Client for WebAPI
            builder.Services.AddHttpClient<IAuthApiClient, AuthApiClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration.GetConnectionString("WebAPI")!);
            });
            builder.Services.AddHttpClient<IUserApiClient, UserApiClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration.GetConnectionString("WebAPI")!);
            });
            builder.Services.AddHttpClient<IAdminApiClient, AdminApiClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration.GetConnectionString("WebAPI")!);
            });
            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (!app.Environment.IsDevelopment())
            {
                app.UseExceptionHandler("/Home/Error");
                // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseStaticFiles();

            app.UseRouting();

            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");

            app.Run();
        }
    }
}
