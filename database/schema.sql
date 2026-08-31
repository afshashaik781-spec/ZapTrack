-- Core Data Models for JSW Electrical Inventory System (PRD Section 3)

-- 1. Users Table / Collection
CREATE TABLE IF NOT EXISTS users (
    Employee_ID VARCHAR(50) PRIMARY KEY,
    Full_Name VARCHAR(100) NOT NULL
);

-- 2. Inventory Table / Collection
CREATE TABLE IF NOT EXISTS inventory (
    Item_ID VARCHAR(50) PRIMARY KEY,
    Item_Name VARCHAR(150) NOT NULL,
    Current_Stock_Level INTEGER NOT NULL DEFAULT 0,
    binningLocation VARCHAR(100) NOT NULL DEFAULT '-'
);

-- 3. Transactions Table / Collection
CREATE TABLE IF NOT EXISTS transactions (
    Transaction_ID VARCHAR(50) PRIMARY KEY,
    Employee_ID VARCHAR(50) NOT NULL,
    Item_ID VARCHAR(50) NOT NULL,
    Quantity_Taken INTEGER NOT NULL CHECK (Quantity_Taken > 0),
    Transaction_Type VARCHAR(20) NOT NULL DEFAULT 'CHECKOUT',
    Timestamp DATETIME NOT NULL,
    Sync_Status BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (Employee_ID) REFERENCES users(Employee_ID) ON UPDATE CASCADE,
    FOREIGN KEY (Item_ID) REFERENCES inventory(Item_ID) ON UPDATE CASCADE
);
