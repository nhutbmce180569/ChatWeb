USE master;
GO

-- =============================================
-- 1. Create database if not exists
-- =============================================
IF DB_ID(N'RealtimeChatDb') IS NULL
BEGIN
    CREATE DATABASE RealtimeChatDb;
END
GO

USE RealtimeChatDb;
GO

-- =============================================
-- 2. Drop tables in dependency order
-- =============================================

-- Drop child tables first
DROP TABLE IF EXISTS dbo.Messages;
DROP TABLE IF EXISTS dbo.ConversationMembers;

-- Then drop parent tables
DROP TABLE IF EXISTS dbo.Conversations;
DROP TABLE IF EXISTS dbo.Users;
DROP TABLE IF EXISTS dbo.Accounts;
GO

-- =============================================
-- 3. Account
-- =============================================
CREATE TABLE dbo.Accounts
(
    Id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_Accounts PRIMARY KEY
        DEFAULT NEWSEQUENTIALID(),

    Email NVARCHAR(255) NOT NULL,
    PasswordHash NVARCHAR(500) NOT NULL,

    Role NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Accounts_Role DEFAULT 'User',

    IsActive BIT NOT NULL
        CONSTRAINT DF_Accounts_IsActive DEFAULT 1,

    CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Accounts_CreatedAt DEFAULT GETUTCDATE(),

    UpdatedAt DATETIME2 NULL,

    CONSTRAINT UQ_Accounts_Email UNIQUE (Email)
);
GO

-- =============================================
-- 4. User
-- =============================================
CREATE TABLE dbo.Users
(
    Id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_Users PRIMARY KEY
        DEFAULT NEWSEQUENTIALID(),

    AccountId UNIQUEIDENTIFIER NOT NULL,

    Username NVARCHAR(50) NOT NULL,
    DisplayName NVARCHAR(100) NOT NULL,

    AvatarUrl NVARCHAR(500) NULL,

    IsOnline BIT NOT NULL
        CONSTRAINT DF_Users_IsOnline DEFAULT 0,

    LastSeenAt DATETIME2 NULL,

    CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Users_CreatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_Users_AccountId UNIQUE (AccountId),
    CONSTRAINT UQ_Users_Username UNIQUE (Username),

    CONSTRAINT FK_Users_Accounts
        FOREIGN KEY (AccountId)
        REFERENCES dbo.Accounts(Id)
);
GO

-- =============================================
-- 5. Conversation
-- =============================================
CREATE TABLE dbo.Conversations
(
    Id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_Conversations PRIMARY KEY
        DEFAULT NEWSEQUENTIALID(),

    Name NVARCHAR(100) NULL,

    -- 1 = Private chat
    -- 2 = Group chat
    Type TINYINT NOT NULL,

    CreatedBy UNIQUEIDENTIFIER NOT NULL,

    CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Conversations_CreatedAt DEFAULT GETUTCDATE(),

    UpdatedAt DATETIME2 NULL,

    CONSTRAINT FK_Conversations_CreatedBy
        FOREIGN KEY (CreatedBy)
        REFERENCES dbo.Users(Id),

    CONSTRAINT CK_Conversations_Type
        CHECK (Type IN (1, 2))
);
GO

-- =============================================
-- 6. Conversation Members
-- =============================================
CREATE TABLE dbo.ConversationMembers
(
    ConversationId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,

    JoinedAt DATETIME2 NOT NULL
        CONSTRAINT DF_ConversationMembers_JoinedAt DEFAULT GETUTCDATE(),

    LeftAt DATETIME2 NULL,

    IsAdmin BIT NOT NULL
        CONSTRAINT DF_ConversationMembers_IsAdmin DEFAULT 0,

    LastReadMessageId UNIQUEIDENTIFIER NULL,

    CONSTRAINT PK_ConversationMembers
        PRIMARY KEY (ConversationId, UserId),

    CONSTRAINT FK_ConversationMembers_Conversation
        FOREIGN KEY (ConversationId)
        REFERENCES dbo.Conversations(Id),

    CONSTRAINT FK_ConversationMembers_User
        FOREIGN KEY (UserId)
        REFERENCES dbo.Users(Id)
);
GO

-- =============================================
-- 7. Messages
-- =============================================
CREATE TABLE dbo.Messages
(
    Id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_Messages PRIMARY KEY
        DEFAULT NEWSEQUENTIALID(),

    ConversationId UNIQUEIDENTIFIER NOT NULL,
    SenderId UNIQUEIDENTIFIER NOT NULL,

    Content NVARCHAR(MAX) NULL,

    -- 1 = Text
    -- 2 = Image
    -- 3 = File
    -- 4 = System
    -- 5 = Voice
    -- 6 = Video
    -- 7 = Call Record
    MessageType TINYINT NOT NULL
        CONSTRAINT DF_Messages_MessageType DEFAULT 1,

    SentAt DATETIME2 NOT NULL
        CONSTRAINT DF_Messages_SentAt DEFAULT GETUTCDATE(),

    EditedAt DATETIME2 NULL,
    DeletedAt DATETIME2 NULL,

    IsRecalled BIT NOT NULL
        CONSTRAINT DF_Messages_IsRecalled DEFAULT 0,

    RecalledAt DATETIME2 NULL,

    CONSTRAINT FK_Messages_Conversation
        FOREIGN KEY (ConversationId)
        REFERENCES dbo.Conversations(Id),

    CONSTRAINT FK_Messages_Sender
        FOREIGN KEY (SenderId)
        REFERENCES dbo.Users(Id),

    CONSTRAINT CK_Messages_MessageType
        CHECK (MessageType IN (1, 2, 3, 4, 5, 6, 7))
);
GO

-- =============================================
-- 8. Indexes
-- =============================================

CREATE INDEX IX_Messages_ConversationId_SentAt
ON dbo.Messages (ConversationId, SentAt DESC);

CREATE INDEX IX_ConversationMembers_UserId
ON dbo.ConversationMembers (UserId);

CREATE INDEX IX_Users_Username
ON dbo.Users (Username);
GO

PRINT N'RealtimeChatDb schema created successfully!';
GO