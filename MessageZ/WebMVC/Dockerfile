# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["WebMVC.csproj", "./"]
RUN dotnet restore "./WebMVC.csproj"

# Copy source files and publish
COPY . .
RUN dotnet publish "./WebMVC.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "WebMVC.dll"]
