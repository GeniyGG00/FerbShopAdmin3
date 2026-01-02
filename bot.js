require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Bot token and chat IDs from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const groupChatId = process.env.GROUP_CHAT_ID;

// Admin usernames (you can add more admins here)
const ADMIN_USERS = [
    'ONEDAYLL', // Замените на реальный юзернейм админа 1
    'Panamka37', // Замените на реальный юзернейм админа 2  
    'Belui2807'  // Замените на реальный юзернейм админа 3
];

// Initialize bot
const bot = new TelegramBot(token, { polling: true });

// Error handling for connection issues
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    if (error && error.code === 'ETELEGRAM') {
        console.log('Telegram API error. Check your internet connection and bot token.');
    }
});

// Handle network errors
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// Simple in-memory storage
const users = {};
const orders = [];

// Helper function to get or create user
function getUser(chatId, username = 'User') {
    if (!users[chatId]) {
        users[chatId] = {
            userId: chatId,
            username: username,
            cart: [],
            comment: ''
        };
    }
    return users[chatId];
}

// Helper function to create order
function createOrder(user) {
    const order = {
        userId: user.userId,
        username: user.username,
        items: [...user.cart],
        comment: user.comment || 'Без комментария',
        status: 'new',
        createdAt: new Date()
    };
    orders.push(order);
    user.cart = []; // Clear cart after order
    return order;
}

// Helper function to check if user is admin
function isAdmin(username) {
    return username && ADMIN_USERS.includes(username);
}

// Helper function to check if any products are available
function hasAvailableProducts() {
    for (const category of Object.values(catalog)) {
        for (const product of category) {
            if (product.quantity > 0) {
                return true;
            }
        }
    }
    return false;
}

// Helper function to remove out of stock products
function removeOutOfStockProducts() {
    let removedProducts = [];
    
    for (const categoryName in catalog) {
        const category = catalog[categoryName];
        const initialLength = category.length;
        
        catalog[categoryName] = category.filter(product => {
            if (product.quantity <= 0) {
                removedProducts.push(`${product.name} из категории ${categoryName}`);
                return false;
            }
            return true;
        });
        
        // Remove empty categories
        if (catalog[categoryName].length === 0) {
            delete catalog[categoryName];
        }
    }
    
    return removedProducts;
}

// Helper function to generate simple product ID (1-3 digits)
function generateProductId(categoryName) {
    const categoryMap = {
        'Одноразки': 'D',
        'Подсистемы': 'P', 
        'Снюс': 'S',
        'Жидкости': 'L'
    };
    
    const prefix = categoryMap[categoryName] || 'X';
    const existingProducts = catalog[categoryName] || [];
    
    // Find the highest existing number in this category
    let maxNum = 0;
    existingProducts.forEach(product => {
        if (product.id && product.id.startsWith(prefix)) {
            const num = parseInt(product.id.replace(prefix, ''));
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    });
    
    const newNum = maxNum + 1;
    return prefix + newNum.toString().padStart(3, '0');
}

// Helper function to add product
function addProduct(categoryName, name, price, quantity) {
    if (!catalog[categoryName]) {
        catalog[categoryName] = [];
    }
    
    const id = generateProductId(categoryName);
    const newProduct = { id, name, price, quantity };
    catalog[categoryName].push(newProduct);
    
    return newProduct;
}

// Helper function to remove product
function removeProduct(categoryName, productId) {
    if (!catalog[categoryName]) {
        return false;
    }
    
    const initialLength = catalog[categoryName].length;
    catalog[categoryName] = catalog[categoryName].filter(p => p.id !== productId);
    
    // Remove empty categories
    if (catalog[categoryName].length === 0) {
        delete catalog[categoryName];
    }
    
    return catalog[categoryName].length < initialLength;
}

// Helper function to update product quantity
function updateProductQuantity(categoryName, productId, newQuantity) {
    if (!catalog[categoryName]) {
        return false;
    }
    
    const product = catalog[categoryName].find(p => p.id === productId);
    if (product) {
        product.quantity = newQuantity;
        return true;
    }
    
    return false;
}

// Product catalog with quantity tracking and simple IDs (1-3 digits)
const catalog = {
    'Одноразки': [
        { id: 'D001', name: 'HQD 2500', price: 1000, quantity: 10 },
        { id: 'D002', name: 'Ivy', price: 1200, quantity: 5 },
        { id: 'D003', name: 'Maskking', price: 1500, quantity: 0 }
    ],
    'Подсистемы': [
        { id: 'P001', name: 'Voopoo', price: 2500, quantity: 3 },
        { id: 'P002', name: 'Uwell', price: 3000, quantity: 7 },
        { id: 'P003', name: 'спизженный хиро 3 в ахуитительном состоянии', price: 5000, quantity: 1 }
    ],
    'Снюс': [
        { id: 'S001', name: 'EPOK', price: 500, quantity: 15 },
        { id: 'S002', name: 'Siberia', price: 600, quantity: 8 },
        { id: 'S003', name: 'Odens', price: 550, quantity: 0 }
    ],
    'Жидкости': [
        { id: 'L001', name: 'Honey Cream 3mg', price: 800, quantity: 20 },
        { id: 'L002', name: 'Mango Ice 3mg', price: 800, quantity: 12 },
        { id: 'L003', name: 'Strawberry 6mg', price: 800, quantity: 6 },
        { id: 'L004', name: 'Tobacco 6mg', price: 800, quantity: 9 },
        { id: 'L005', name: 'Menthol 0mg', price: 800, quantity: 4 },
        { id: 'L006', name: 'Blueberry 3mg', price: 800, quantity: 11 }
    ]
};

// Command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    // Debug: Log user info
    console.log(`User: ${username}, isAdmin: ${isAdmin(msg.from.username)}`);
    
    // Get or create user
    const user = getUser(chatId, username);

    // Send welcome message with main menu
    const welcomeMessage = `👋 Привет, ${username}! Добро пожаловать в FerbShop!\n\n` +
                         'Выберите категорию товаров:';
    
    // Add admin button for admin users
    const menuButtons = isAdmin(msg.from.username) ? 
        [['🛒 Каталог'], ['🛒 Корзина'], ['ℹ️ О нас'], ['👨‍💼 Админка']] :
        [['🛒 Каталог'], ['🛒 Корзина'], ['ℹ️ О нас']];
    
    const menu = {
        reply_markup: {
            keyboard: menuButtons,
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, welcomeMessage, menu);
});

// Handle admin back button
bot.onText(/🔙 Назад/, (msg) => {
    const chatId = msg.chat.id;
    
    const menuButtons = isAdmin(msg.from.username) ? 
        [['🛒 Каталог'], ['🛒 Корзина'], ['ℹ️ О нас'], ['👨‍💼 Админка']] :
        [['🛒 Каталог'], ['🛒 Корзина'], ['ℹ️ О нас']];
    
    const menu = {
        reply_markup: {
            keyboard: menuButtons,
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, 'Главное меню:', menu);
});

// Handle admin panel button
bot.onText(/👨‍💼 Админка/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    const adminMenu = {
        reply_markup: {
            keyboard: [
                ['📊 Товары в наличии'],
                ['➕ Добавить товар'],
                ['🗑️ Удалить товар'],
                ['📦 Изменить количество'],
                ['🧹 Очистить отсутствующие'],
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, '👨‍💼 <b>Панель администратора</b>\n\nВыберите действие:', {
        parse_mode: 'HTML',
        ...adminMenu
    });
});

// Admin commands
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    const adminMenu = {
        reply_markup: {
            keyboard: [
                ['📊 Товары в наличии'],
                ['➕ Добавить товар'],
                ['🗑️ Удалить товар'],
                ['📦 Изменить количество'],
                ['🧹 Очистить отсутствующие'],
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, '👨‍💼 <b>Панель администратора</b>\n\nВыберите действие:', {
        parse_mode: 'HTML',
        ...adminMenu
    });
});

// Handle admin menu options
bot.onText(/📊 Товары в наличии/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    let catalogText = '📊 <b>Товары в наличии:</b>\n\n';
    let totalProducts = 0;
    let availableProducts = 0;
    
    for (const categoryName in catalog) {
        const category = catalog[categoryName];
        if (category.length > 0) {
            catalogText += `📦 <b>${categoryName}:</b>\n`;
            
            category.forEach(product => {
                totalProducts++;
                if (product.quantity > 0) availableProducts++;
                
                const status = product.quantity > 0 ? '✅' : '❌';
                const stockInfo = product.quantity > 0 ? `${product.quantity} шт.` : 'Нет в наличии';
                catalogText += `${status} <b>${product.name}</b> (${product.id}) - ${product.price}₽ - ${stockInfo}\n`;
            });
            catalogText += '\n';
        }
    }
    
    catalogText += `\n📈 <b>Статистика:</b>\n`;
    catalogText += `📦 Всего товаров: ${totalProducts}\n`;
    catalogText += `✅ Доступно: ${availableProducts}\n`;
    catalogText += `❌ Отсутствует: ${totalProducts - availableProducts}`;
    
    if (totalProducts === 0) {
        catalogText = '📊 <b>Товары в наличии:</b>\n\n❌ Каталог пуст!';
    }
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                { text: '🔄 Обновить', callback_data: 'refresh_products' }
            ]],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, catalogText, { 
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
});

bot.onText(/➕ Добавить товар/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    // Set user state to waiting for category selection
    const user = getUser(chatId);
    user.waitingForQuickCategory = true;
    
    const categories = Object.keys(catalog);
    const categoryButtons = categories.map(cat => [cat]);
    
    // Add option for new category
    categoryButtons.push(['➕ Создать новую категорию']);
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ...categoryButtons,
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, '➕ <b>Быстрое добавление товара</b>\n\n' +
        'Выберите категорию или создайте новую:', {
        parse_mode: 'HTML',
        ...keyboard
    });
});

bot.onText(/🗑️ Удалить товар/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    // Set user state to waiting for product removal
    const user = getUser(chatId);
    user.waitingForProductRemove = true;
    
    let catalogText = '🗑️ <b>Удаление товара</b>\n\n' +
        'Выберите товар для удаления:\n\n';
    
    for (const categoryName in catalog) {
        const category = catalog[categoryName];
        if (category.length > 0) {
            catalogText += `📦 <b>${categoryName}:</b>\n`;
            
            category.forEach(product => {
                const status = product.quantity > 0 ? '✅' : '❌';
                catalogText += `${status} ${product.name} (${product.id}) - ${product.price}₽\n`;
            });
            catalogText += '\n';
        }
    }
    
    catalogText += '\nОтправьте ID товара для удаления (например: D001)';
    
    bot.sendMessage(chatId, catalogText, { parse_mode: 'HTML' });
});

bot.onText(/📦 Изменить количество/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    // Set user state to waiting for quantity update
    const user = getUser(chatId);
    user.waitingForQuantityUpdate = true;
    
    let catalogText = '📦 <b>Изменение количества</b>\n\n' +
        'Выберите товар:\n\n';
    
    for (const categoryName in catalog) {
        const category = catalog[categoryName];
        if (category.length > 0) {
            catalogText += `📦 <b>${categoryName}:</b>\n`;
            
            category.forEach(product => {
                const status = product.quantity > 0 ? '✅' : '❌';
                catalogText += `${status} ${product.name} (${product.id}) - сейчас: ${product.quantity} шт.\n`;
            });
            catalogText += '\n';
        }
    }
    
    catalogText += '\nОтправьте ID товара и новое количество (например: D001|25)';
    
    bot.sendMessage(chatId, catalogText, { parse_mode: 'HTML' });
});

bot.onText(/📝 Добавить список/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    // Set user state to waiting for category selection
    const user = getUser(chatId);
    user.waitingForCategoryList = true;
    
    const categories = Object.keys(catalog);
    const categoryButtons = categories.map(cat => [cat]);
    
    // Add option for new category
    categoryButtons.push(['➕ Создать новую категорию']);
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ...categoryButtons,
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, '📝 <b>Добавление списка товаров - Шаг 1/3</b>\n\n' +
        'Выберите категорию или создайте новую:', {
        parse_mode: 'HTML',
        ...keyboard
    });
});

bot.onText(/🗑️ Массовое удаление/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    // Set user state to waiting for category selection
    const user = getUser(chatId);
    user.waitingForMassDelete = true;
    
    const categories = Object.keys(catalog);
    const categoryButtons = categories.map(cat => [cat]);
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ...categoryButtons,
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, '🗑️ <b>Массовое удаление товаров - Шаг 1/2</b>\n\n' +
        'Выберите категорию для очистки:', {
        parse_mode: 'HTML',
        ...keyboard
    });
});

bot.onText(/🧹 Очистить отсутствующие/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isAdmin(username)) {
        return bot.sendMessage(chatId, '🚫 У вас нет прав для выполнения этой команды.');
    }
    
    const removedProducts = removeOutOfStockProducts();
    
    if (removedProducts.length === 0) {
        bot.sendMessage(chatId, '🧹 <b>Очистка отсутствующих товаров</b>\n\n' +
            '✅ Все товары в наличии!', { parse_mode: 'HTML' });
    } else {
        let message = '🧹 <b>Очистка отсутствующих товаров</b>\n\n' +
            '🗑️ Удаленные товары:\n';
        removedProducts.forEach(product => {
            message += `• ${product}\n`;
        });
        message += `\n✅ Удалено ${removedProducts.length} товаров!`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

// Handle category selection
bot.onText(/🛒 Каталог|🔙 Назад в каталог/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!hasAvailableProducts()) {
        const outOfStockMenu = {
            reply_markup: {
                keyboard: [
                    ['🛒 Корзина'],
                    ['ℹ️ О нас']
                ],
                resize_keyboard: true
            }
        };
        
        return bot.sendMessage(chatId, '❌ <b>К сожалению, все товары закончились!</b>\n\n' +
            'Попробуйте зайти позже или свяжитесь с менеджером @Ferb_manger02', {
                parse_mode: 'HTML',
                ...outOfStockMenu
            });
    }
    
    const categories = Object.keys(catalog);
    const categoryButtons = categories.map(cat => [cat]);
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ...categoryButtons,
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, 'Выберите категорию товаров:', keyboard);
});

// Handle product category selection
Object.keys(catalog).forEach(category => {
    bot.onText(new RegExp(`^${category}$`), (msg) => {
        const chatId = msg.chat.id;
        const products = catalog[category];
        
        // Filter products with quantity > 0
        const availableProducts = products.filter(product => product.quantity > 0);
        
        if (availableProducts.length === 0) {
            return bot.sendMessage(chatId, `❌ В категории "${category}" все товары закончились!\n\nВыберите другую категорию:`);
        }
        
        const productButtons = availableProducts.map(product => [
            {
                text: `➕ ${product.name} - ${product.price}₽ (${product.quantity} шт.)`,
                callback_data: `add_${product.id}`
            }
        ]);
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: productButtons,
                resize_keyboard: true
            }
        };
        
        bot.sendMessage(chatId, `📦 *${category}*:\nВыберите товар:`, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    });
});

// Handle inline buttons
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    if (data.startsWith('add_')) {
        const productId = data.replace('add_', '');
        const product = Object.values(catalog)
            .flat()
            .find(p => p.id === productId);

        if (product) {
            // Check if product is still available
            if (product.quantity <= 0) {
                bot.answerCallbackQuery(query.id, {
                    text: '❌ Товар закончился!',
                    show_alert: true
                });
                return;
            }
            
            const user = getUser(chatId);
            const existingItem = user.cart.find(item => item.name === product.name);
            
            // Check if trying to add more than available
            const currentQuantity = existingItem ? existingItem.quantity : 0;
            if (currentQuantity >= product.quantity) {
                bot.answerCallbackQuery(query.id, {
                    text: `❌ В наличии только ${product.quantity} шт.!`,
                    show_alert: true
                });
                return;
            }
            
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                user.cart.push({
                    name: product.name,
                    price: product.price,
                    quantity: 1
                });
            }
            
            bot.answerCallbackQuery(query.id, {
                text: `Добавлено: ${product.name} (осталось ${product.quantity - 1} шт.)`,
                show_alert: false
            });
        }
    }
    
    // Handle refresh products button
    if (data === 'refresh_products') {
        const username = query.from.username;
        if (isAdmin(username)) {
            // Trigger products display again
            const refreshMsg = { ...query.message, text: '📊 Товары в наличии' };
            const handler = bot.getTextHandler && bot.getTextHandler(/📊 Товары в наличии/);
            if (handler) {
                handler(refreshMsg);
            }
        }
        
        bot.answerCallbackQuery(query.id, {
            text: '🔄 Обновлено!',
            show_alert: false
        });
    }
});

// Handle cart
bot.onText(/🛒 Корзина/, (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    
    if (!user.cart || user.cart.length === 0) {
        return bot.sendMessage(chatId, 'Ваша корзина пуста!');
    }
    
    const cartItems = user.cart.map((item, index) => 
        `${index + 1}. ${item.name} - ${item.quantity} x ${item.price}₽ = ${item.quantity * item.price}₽`
    ).join('\n');
    
    const total = user.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const message = `🛒 *Ваша корзина:*\n\n${cartItems}\n\n*Итого: ${total}₽*`;
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ['✅ Оформить заказ'],
                ['❌ Очистить корзину'],
                ['🔙 Назад в каталог']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, message, { 
        ...keyboard,
        parse_mode: 'Markdown'
    });
});

// Handle order placement
bot.onText(/✅ Оформить заказ/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    
    if (!user.cart || user.cart.length === 0) {
        return bot.sendMessage(chatId, 'Ваша корзина пуста!');
    }
    
    // Set user state to waiting for comment
    user.waitingForComment = true;
    
    // Ask for a comment
    bot.sendMessage(chatId, '💬 Введите комментарий к заказу (или нажмите "Пропустить"):', {
        reply_markup: {
            keyboard: [['Пропустить']],
            resize_keyboard: true
        }
    });
});

// Handle comment input
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    const user = getUser(chatId, msg.from.username || msg.from.first_name);
    
    // Handle admin commands
    if (isAdmin(username)) {
        // Handle category selection for list addition
        if (user.waitingForCategoryList) {
            user.waitingForCategoryList = false;
            
            if (msg.text === '➕ Создать новую категорию') {
                user.waitingForNewCategoryList = true;
                bot.sendMessage(chatId, '📝 <b>Добавление списка товаров - Шаг 2/3</b>\n\n' +
                    'Введите название новой категории:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            // Check if category exists
            if (!catalog[msg.text]) {
                user.waitingForCategoryList = true;
                bot.sendMessage(chatId, '❌ <b>Категория не найдена!</b>\n\n' +
                    'Выберите существующую категорию или создайте новую:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.selectedCategory = msg.text;
            user.waitingForProductList = true;
            
            bot.sendMessage(chatId, '📝 <b>Добавление списка товаров - Шаг 3/3</b>\n\n' +
                `Выбрана категория: <b>${msg.text}</b>\n\n` +
                'Отправьте список товаров в формате:\n\n' +
                '<code>название|цена|количество</code>\n' +
                '<code>название|цена|количество</code>\n' +
                '<code>название|цена|количество</code>\n\n' +
                'Пример:\n' +
                '<code>HQD 3000|1200|15</code>\n' +
                '<code>Ivy Bar|1500|10</code>\n' +
                '<code>Maskking|1800|8</code>', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle new category creation for list
        if (user.waitingForNewCategoryList) {
            user.waitingForNewCategoryList = false;
            user.selectedCategory = msg.text;
            user.waitingForProductList = true;
            
            bot.sendMessage(chatId, '📝 <b>Добавление списка товаров - Шаг 3/3</b>\n\n' +
                `Создана категория: <b>${msg.text}</b>\n\n` +
                'Отправьте список товаров в формате:\n\n' +
                '<code>название|цена|количество</code>\n' +
                '<code>название|цена|количество</code>\n\n' +
                'Пример:\n' +
                '<code>HQD 3000|1200|15</code>\n' +
                '<code>Ivy Bar|1500|10</code>', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle product list input
        if (user.waitingForProductList) {
            user.waitingForProductList = false;
            
            const lines = msg.text.split('\n').filter(line => line.trim());
            const addedProducts = [];
            const errors = [];
            
            lines.forEach((line, index) => {
                const parts = line.split('|');
                if (parts.length === 3) {
                    const [name, price, quantity] = parts;
                    const priceNum = parseInt(price.trim());
                    const quantityNum = parseInt(quantity.trim());
                    
                    if (!isNaN(priceNum) && priceNum > 0 && !isNaN(quantityNum) && quantityNum >= 0) {
                        const newProduct = addProduct(user.selectedCategory, name.trim(), priceNum, quantityNum);
                        addedProducts.push(newProduct);
                    } else {
                        errors.push(`Строка ${index + 1}: неверные данные`);
                    }
                } else {
                    errors.push(`Строка ${index + 1}: неверный формат`);
                }
            });
            
            let responseText = `📝 <b>Результат добавления списка:</b>\n\n`;
            
            if (addedProducts.length > 0) {
                responseText += `✅ <b>Добавлено товаров: ${addedProducts.length}</b>\n\n`;
                addedProducts.forEach(product => {
                    responseText += `📦 ${product.name} (${product.id}) - ${product.price}₽ - ${product.quantity} шт.\n`;
                });
            }
            
            if (errors.length > 0) {
                responseText += `\n❌ <b>Ошибки:</b>\n`;
                errors.forEach(error => {
                    responseText += `• ${error}\n`;
                });
            }
            
            // Clean up user state
            delete user.selectedCategory;
            
            bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });
            return;
        }
        
        // Handle category selection for mass delete
        if (user.waitingForMassDelete) {
            user.waitingForMassDelete = false;
            
            // Check if category exists
            if (!catalog[msg.text]) {
                user.waitingForMassDelete = true;
                bot.sendMessage(chatId, '❌ <b>Категория не найдена!</b>\n\n' +
                    'Выберите существующую категорию:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            const category = catalog[msg.text];
            const productCount = category.length;
            
            if (productCount === 0) {
                bot.sendMessage(chatId, `📦 Категория <b>${msg.text}</b> уже пуста!`, { parse_mode: 'HTML' });
                return;
            }
            
            // Show products for confirmation
            let productsText = `🗑️ <b>Удаление категории "${msg.text}"</b>\n\n` +
                `Найдено товаров: ${productCount}\n\n`;
            
            category.forEach(product => {
                productsText += `• ${product.name} (${product.id}) - ${product.price}₽\n`;
            });
            
            productsText += '\n⚠️ <b>Внимание!</b> Все товары будут удалены!\n' +
                'Отправьте "ПОДТВЕРЖДАЮ" для удаления или "ОТМЕНА" для отмены.';
            
            user.waitingForMassDeleteConfirm = true;
            user.selectedCategoryForDelete = msg.text;
            
            bot.sendMessage(chatId, productsText, { parse_mode: 'HTML' });
            return;
        }
        
        // Handle mass delete confirmation
        if (user.waitingForMassDeleteConfirm) {
            user.waitingForMassDeleteConfirm = false;
            
            if (msg.text.toUpperCase() === 'ПОДТВЕРЖДАЮ') {
                const categoryName = user.selectedCategoryForDelete;
                const deletedCount = catalog[categoryName].length;
                
                delete catalog[categoryName];
                delete user.selectedCategoryForDelete;
                
                bot.sendMessage(chatId, `✅ <b>Категория удалена!</b>\n\n` +
                    `📦 Категория: ${categoryName}\n` +
                    `🗑️ Удалено товаров: ${deletedCount}`, { parse_mode: 'HTML' });
            } else if (msg.text.toUpperCase() === 'ОТМЕНА') {
                delete user.selectedCategoryForDelete;
                bot.sendMessage(chatId, '❌ <b>Операция отменена</b>\n\nКатегория не была удалена.', { parse_mode: 'HTML' });
            } else {
                user.waitingForMassDeleteConfirm = true;
                bot.sendMessage(chatId, '❌ <b>Неверная команда!</b>\n\n' +
                    'Отправьте "ПОДТВЕРЖДАЮ" для удаления или "ОТМЕНА" для отмены.', { parse_mode: 'HTML' });
            }
            return;
        }
        // Handle quick category selection
        if (user.waitingForQuickCategory) {
            user.waitingForQuickCategory = false;
            
            if (msg.text === '➕ Создать новую категорию') {
                user.waitingForQuickNewCategory = true;
                bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 2/3</b>\n\n' +
                    'Введите название новой категории:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            // Check if category exists
            if (!catalog[msg.text]) {
                user.waitingForQuickCategory = true;
                bot.sendMessage(chatId, '❌ <b>Категория не найдена!</b>\n\n' +
                    'Выберите существующую категорию или создайте новую:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.selectedCategory = msg.text;
            user.waitingForQuickName = true;
            
            bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 2/3</b>\n\n' +
                `Выбрана категория: <b>${msg.text}</b>\n\n` +
                'Введите название товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle quick new category creation
        if (user.waitingForQuickNewCategory) {
            user.waitingForQuickNewCategory = false;
            user.selectedCategory = msg.text;
            user.waitingForQuickName = true;
            
            bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 3/3</b>\n\n' +
                `Создана категория: <b>${msg.text}</b>\n\n` +
                'Введите название товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle quick product name input
        if (user.waitingForQuickName) {
            user.waitingForQuickName = false;
            user.productName = msg.text;
            user.waitingForQuickPrice = true;
            
            const keyboard = {
                reply_markup: {
                    keyboard: [
                        ['500₽', '800₽', '1000₽'],
                        ['1200₽', '1500₽', '2000₽'],
                        ['2500₽', '3000₽', '5000₽'],
                        ['💰 Своя цена']
                    ],
                    resize_keyboard: true
                }
            };
            
            bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 3/3</b>\n\n' +
                `Название: <b>${msg.text}</b>\n\n` +
                'Выберите цену:', {
                parse_mode: 'HTML',
                ...keyboard
                });
            return;
        }
        
        // Handle quick price selection
        if (user.waitingForQuickPrice) {
            user.waitingForQuickPrice = false;
            
            let price;
            if (msg.text === '💰 Своя цена') {
                user.waitingForCustomPrice = true;
                bot.sendMessage(chatId, '💰 <b>Введите свою цену:</b>\n\n' +
                    'Отправьте сумму в рублях:', {
                    parse_mode: 'HTML'
                    });
                return;
            } else {
                // Extract price from button text
                price = parseInt(msg.text.replace('₽', '').replace(/\s/g, ''));
                if (isNaN(price) || price <= 0) {
                    user.waitingForQuickPrice = true;
                    bot.sendMessage(chatId, '❌ <b>Неверная цена!</b>\n\n' +
                        'Выберите цену из предложенных вариантов:', {
                        parse_mode: 'HTML'
                        });
                    return;
                }
            }
            
            user.productPrice = price;
            user.waitingForQuickQuantity = true;
            
            const quantityKeyboard = {
                reply_markup: {
                    keyboard: [
                        ['1', '5', '10'],
                        ['15', '20', '25'],
                        ['30', '50', '100'],
                        ['🔢 Свое количество']
                    ],
                    resize_keyboard: true
                }
            };
            
            bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 4/4</b>\n\n' +
                `Цена: <b>${price}₽</b>\n\n` +
                'Выберите количество:', {
                parse_mode: 'HTML',
                ...quantityKeyboard
                });
            return;
        }
        
        // Handle custom price input
        if (user.waitingForCustomPrice) {
            user.waitingForCustomPrice = false;
            
            const price = parseInt(msg.text);
            if (isNaN(price) || price <= 0) {
                user.waitingForCustomPrice = true;
                bot.sendMessage(chatId, '❌ <b>Неверная цена!</b>\n\n' +
                    'Введите корректную сумму в рублях:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.productPrice = price;
            user.waitingForQuickQuantity = true;
            
            const quantityKeyboard = {
                reply_markup: {
                    keyboard: [
                        ['1', '5', '10'],
                        ['15', '20', '25'],
                        ['30', '50', '100'],
                        ['🔢 Свое количество']
                    ],
                    resize_keyboard: true
                }
            };
            
            bot.sendMessage(chatId, '➕ <b>Быстрое добавление - Шаг 4/4</b>\n\n' +
                `Цена: <b>${price}₽</b>\n\n` +
                'Выберите количество:', {
                parse_mode: 'HTML',
                ...quantityKeyboard
                });
            return;
        }
        
        // Handle quick quantity selection
        if (user.waitingForQuickQuantity) {
            user.waitingForQuickQuantity = false;
            
            let quantity;
            if (msg.text === '🔢 Свое количество') {
                user.waitingForCustomQuantity = true;
                bot.sendMessage(chatId, '🔢 <b>Введите количество:</b>\n\n' +
                    'Отправьте количество товара:', {
                    parse_mode: 'HTML'
                    });
                return;
            } else {
                quantity = parseInt(msg.text);
                if (isNaN(quantity) || quantity < 0) {
                    user.waitingForQuickQuantity = true;
                    bot.sendMessage(chatId, '❌ <b>Неверное количество!</b>\n\n' +
                        'Выберите количество из предложенных вариантов:', {
                        parse_mode: 'HTML'
                        });
                    return;
                }
            }
            
            user.waitingForQuickQuantity = false;
            
            // Add the product
            const newProduct = addProduct(user.selectedCategory, user.productName, user.productPrice, quantity);
            
            // Clean up user state
            delete user.selectedCategory;
            delete user.productName;
            delete user.productPrice;
            
            bot.sendMessage(chatId, `✅ <b>Товар успешно добавлен!</b>\n\n` +
                `📦 Категория: ${user.selectedCategory}\n` +
                `📝 Название: ${user.productName}\n` +
                `💰 Цена: ${user.productPrice}₽\n` +
                `📊 Количество: ${quantity} шт.\n` +
                `🆔 ID: ${newProduct.id}`, {
                parse_mode: 'HTML'
                });
            
            // Show admin menu again
            const adminMenuMsg = { ...msg, text: '/admin' };
            const adminHandler = bot.getTextHandler && bot.getTextHandler(/👨‍💼 Админка/);
            if (adminHandler) {
                adminHandler(adminMenuMsg);
            } else {
                // Fallback - show admin menu directly
                const adminMenu = {
                    reply_markup: {
                        keyboard: [
                            ['📊 Товары в наличии'],
                            ['➕ Добавить товар', '📝 Добавить список'],
                            ['🗑️ Удалить товар', '🗑️ Массовое удаление'],
                            ['📦 Изменить количество'],
                            ['🧹 Очистить отсутствующие'],
                            ['🔙 Назад']
                        ],
                        resize_keyboard: true
                    }
                };
                
                bot.sendMessage(chatId, '👨‍💼 <b>Панель администратора</b>\n\nВыберите действие:', {
                    parse_mode: 'HTML',
                    ...adminMenu
                });
            }
            return;
        }
        
        // Handle custom quantity input
        if (user.waitingForCustomQuantity) {
            user.waitingForCustomQuantity = false;
            
            const quantity = parseInt(msg.text);
            if (isNaN(quantity) || quantity < 0) {
                user.waitingForCustomQuantity = true;
                bot.sendMessage(chatId, '❌ <b>Неверное количество!</b>\n\n' +
                    'Введите корректное количество:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            // Add the product
            const newProduct = addProduct(user.selectedCategory, user.productName, user.productPrice, quantity);
            
            // Clean up user state
            delete user.selectedCategory;
            delete user.productName;
            delete user.productPrice;
            
            bot.sendMessage(chatId, `✅ <b>Товар успешно добавлен!</b>\n\n` +
                `📦 Категория: ${user.selectedCategory}\n` +
                `📝 Название: ${user.productName}\n` +
                `💰 Цена: ${user.productPrice}₽\n` +
                `📊 Количество: ${quantity} шт.\n` +
                `🆔 ID: ${newProduct.id}`, {
                parse_mode: 'HTML'
                });
            
            // Show admin menu again
            const adminMenuMsg = { ...msg, text: '/admin' };
            const adminHandler = bot.getTextHandler && bot.getTextHandler(/👨‍💼 Админка/);
            if (adminHandler) {
                adminHandler(adminMenuMsg);
            }
            return;
        }
        
        // Handle old category selection (for backward compatibility)
        if (user.waitingForCategory) {
            user.waitingForCategory = false;
            
            if (msg.text === '➕ Создать новую категорию') {
                user.waitingForNewCategory = true;
                bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 2/4</b>\n\n' +
                    'Введите название новой категории:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            // Check if category exists
            if (!catalog[msg.text]) {
                user.waitingForCategory = true;
                bot.sendMessage(chatId, '❌ <b>Категория не найдена!</b>\n\n' +
                    'Выберите существующую категорию или создайте новую:', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.selectedCategory = msg.text;
            user.waitingForProductName = true;
            
            bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 2/4</b>\n\n' +
                `Выбрана категория: <b>${msg.text}</b>\n\n` +
                'Введите название товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle new category creation
        if (user.waitingForNewCategory) {
            user.waitingForNewCategory = false;
            user.selectedCategory = msg.text;
            user.waitingForProductName = true;
            
            bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 3/4</b>\n\n' +
                `Создана категория: <b>${msg.text}</b>\n\n` +
                'Введите название товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle product name input
        if (user.waitingForProductName) {
            user.waitingForProductName = false;
            user.productName = msg.text;
            user.waitingForProductPrice = true;
            
            bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 3/4</b>\n\n' +
                `Название товара: <b>${msg.text}</b>\n\n` +
                'Введите цену товара (в рублях):', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle product price input
        if (user.waitingForProductPrice) {
            const price = parseInt(msg.text);
            if (isNaN(price) || price <= 0) {
                bot.sendMessage(chatId, '❌ <b>Неверная цена!</b>\n\n' +
                    'Введите корректную цену (только цифры):', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.waitingForProductPrice = false;
            user.productPrice = price;
            user.waitingForProductQuantity = true;
            
            bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 4/4</b>\n\n' +
                `Цена: <b>${price}₽</b>\n\n` +
                'Введите количество товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
            
            user.waitingForProductPrice = false;
            user.productPrice = price;
            user.waitingForProductQuantity = true;
            
            bot.sendMessage(chatId, '➕ <b>Добавление товара - Шаг 4/4</b>\n\n' +
                `Цена: <b>${price}₽</b>\n\n` +
                'Введите количество товара:', {
                parse_mode: 'HTML'
                });
            return;
        }
        
        // Handle product quantity input
        if (user.waitingForProductQuantity) {
            const quantity = parseInt(msg.text);
            if (isNaN(quantity) || quantity < 0) {
                bot.sendMessage(chatId, '❌ <b>Неверное количество!</b>\n\n' +
                    'Введите корректное количество (только цифры):', {
                    parse_mode: 'HTML'
                    });
                return;
            }
            
            user.waitingForProductQuantity = false;
            
            // Add the product
            const newProduct = addProduct(user.selectedCategory, user.productName, user.productPrice, quantity);
            
            // Clean up user state
            delete user.selectedCategory;
            delete user.productName;
            delete user.productPrice;
            
            bot.sendMessage(chatId, `✅ <b>Товар успешно добавлен!</b>\n\n` +
                `📦 Категория: ${user.selectedCategory}\n` +
                `📝 Название: ${user.productName}\n` +
                `💰 Цена: ${user.productPrice}₽\n` +
                `📊 Количество: ${quantity} шт.\n` +
                `🆔 ID: ${newProduct.id}`, {
                parse_mode: 'HTML'
                });
            
            // Show admin menu again
            const adminMenuMsg = { ...msg, text: '/admin' };
            const adminHandler = bot.getTextHandler && bot.getTextHandler(/👨‍💼 Админка/);
            if (adminHandler) {
                adminHandler(adminMenuMsg);
            } else {
                // Fallback - show admin menu directly
                const adminMenu = {
                    reply_markup: {
                        keyboard: [
                            ['📊 Товары в наличии'],
                            ['➕ Добавить товар', '📝 Добавить список'],
                            ['🗑️ Удалить товар', '🗑️ Массовое удаление'],
                            ['📦 Изменить количество'],
                            ['🧹 Очистить отсутствующие'],
                            ['🔙 Назад']
                        ],
                        resize_keyboard: true
                    }
                };
                
                bot.sendMessage(chatId, '👨‍💼 <b>Панель администратора</b>\n\nВыберите действие:', {
                    parse_mode: 'HTML',
                    ...adminMenu
                });
            }
            return;
        }
        
        // Handle product addition (old method - keep for compatibility)
        if (user.waitingForProductAdd) {
            user.waitingForProductAdd = false;
            
            const parts = msg.text.split('|');
            if (parts.length === 4) {
                const [category, name, price, quantity] = parts;
                const newProduct = addProduct(category.trim(), name.trim(), parseInt(price), parseInt(quantity));
                
                bot.sendMessage(chatId, `✅ <b>Товар добавлен!</b>\n\n` +
                    `📦 Категория: ${category}\n` +
                    `📝 Название: ${name}\n` +
                    `💰 Цена: ${price}₽\n` +
                    `📊 Количество: ${quantity} шт.\n` +
                    `🆔 ID: ${newProduct.id}`, { parse_mode: 'HTML' });
            } else {
                bot.sendMessage(chatId, '❌ <b>Неверный формат!</b>\n\n' +
                    'Используйте формат: <code>категория|название|цена|количество</code>', { parse_mode: 'HTML' });
            }
            return;
        }
        
        // Handle product removal
        if (user.waitingForProductRemove) {
            user.waitingForProductRemove = false;
            
            const productId = msg.text.trim().toUpperCase();
            let removed = false;
            let removedProductInfo = '';
            
            for (const categoryName in catalog) {
                const category = catalog[categoryName];
                const productIndex = category.findIndex(p => p.id.toUpperCase() === productId);
                
                if (productIndex !== -1) {
                    const removedProduct = category[productIndex];
                    removedProductInfo = `${removedProduct.name} (${removedProduct.id})`;
                    category.splice(productIndex, 1);
                    removed = true;
                    
                    // Remove empty categories
                    if (category.length === 0) {
                        delete catalog[categoryName];
                    }
                    break;
                }
            }
            
            if (removed) {
                bot.sendMessage(chatId, `✅ <b>Товар удален!</b>\n\n🗑️ Удален: ${removedProductInfo}`, { parse_mode: 'HTML' });
            } else {
                bot.sendMessage(chatId, `❌ <b>Товар не найден!</b>\n\n🆔 ID: ${productId}\n\nПроверьте правильность ID и попробуйте снова.`, { parse_mode: 'HTML' });
            }
            return;
        }
        
        // Handle quantity update
        if (user.waitingForQuantityUpdate) {
            user.waitingForQuantityUpdate = false;
            
            const parts = msg.text.split('|');
            if (parts.length === 2) {
                const [productId, newQuantity] = parts;
                const id = productId.trim().toUpperCase();
                const quantity = parseInt(newQuantity);
                
                if (isNaN(quantity) || quantity < 0) {
                    bot.sendMessage(chatId, '❌ <b>Неверное количество!</b>\n\nВведите корректное количество (только цифры):', { parse_mode: 'HTML' });
                    return;
                }
                
                let updated = false;
                let updatedProductInfo = '';
                
                for (const categoryName in catalog) {
                    const category = catalog[categoryName];
                    const product = category.find(p => p.id.toUpperCase() === id);
                    
                    if (product) {
                        const oldQuantity = product.quantity;
                        product.quantity = quantity;
                        updatedProductInfo = `${product.name} (${product.id}): ${oldQuantity} → ${quantity} шт.`;
                        updated = true;
                        break;
                    }
                }
                
                if (updated) {
                    bot.sendMessage(chatId, `✅ <b>Количество обновлено!</b>\n\n📦 Обновлен: ${updatedProductInfo}`, { parse_mode: 'HTML' });
                } else {
                    bot.sendMessage(chatId, `❌ <b>Товар не найден!</b>\n\n🆔 ID: ${id}\n\nПроверьте правильность ID и попробуйте снова.`, { parse_mode: 'HTML' });
                }
            } else {
                bot.sendMessage(chatId, '❌ <b>Неверный формат!</b>\n\n' +
                    'Используйте формат: <code>ID товара|новое количество</code>\n\n' +
                    'Пример: <code>D001|25</code>', { parse_mode: 'HTML' });
            }
            return;
        }
    
    // Check if user is waiting for comment
    if (user.waitingForComment) {
        // Reset waiting state
        user.waitingForComment = false;
        
        // Process comment
        if (msg.text === 'Пропустить') {
            user.comment = 'Без комментария';
        } else if (msg.text && !msg.text.startsWith('/')) {
            user.comment = msg.text;
        } else {
            user.comment = 'Без комментария';
        }
        
        // Check if all items in cart are still available
        let unavailableItems = [];
        for (const cartItem of user.cart) {
            const product = Object.values(catalog).flat().find(p => p.name === cartItem.name);
            if (!product || product.quantity < cartItem.quantity) {
                unavailableItems.push(cartItem.name);
            }
        }
        
        if (unavailableItems.length > 0) {
            bot.sendMessage(chatId, '❌ <b>Некоторые товары в корзине закончились!</b>\n\n' +
                'Товары, которые больше недоступны:\n' +
                unavailableItems.map(item => `• ${item}`).join('\n') + '\n\n' +
                'Пожалуйста, удалите их из корзины и оформите заказ заново.', { parse_mode: 'HTML' });
            return;
        }
        
        // Create order and reduce quantities
        const order = createOrder(user);
        
        // Reduce product quantities
        for (const orderItem of order.items) {
            const product = Object.values(catalog).flat().find(p => p.name === orderItem.name);
            if (product) {
                product.quantity -= orderItem.quantity;
            }
        }
        
        // Check for products that reached zero quantity and remove them
        const removedProducts = removeOutOfStockProducts();
        if (removedProducts.length > 0) {
            // Notify admins about automatic removal
            const adminNotification = `🧹 <b>Автоматическое удаление товаров</b>\n\n` +
                'Следующие товары закончились и были удалены:\n' +
                removedProducts.map(product => `• ${product}`).join('\n');
            
            ADMIN_USERS.forEach(adminUsername => {
                // You might want to store admin chat IDs for direct messaging
                // For now, this will be sent to the admin chat
                bot.sendMessage(adminChatId, adminNotification, { parse_mode: 'HTML' });
            });
        }
        
        // Notify admin with enhanced user details
        const orderItems = order.items.map(item => 
            `• ${item.name} - ${item.quantity} x ${item.price}₽ = ${item.quantity * item.price}₽`
        ).join('\n');
        
        const total = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const userInfo = `👤 <b>Информация о заказчике:</b>
├ Имя: ${msg.from.first_name || 'Не указано'}
├ Фамилия: ${msg.from.last_name || 'Не указана'}
├ Username: @${msg.from.username || 'отсутствует'}
└ ID: <code>${order.userId}</code>`;

        const adminMessage = '🛍 <b>НОВЫЙ ЗАКАЗ</b> 🛍\n\n' +
                           `${userInfo}\n\n` +
                           '📦 <b>Состав заказа:</b>\n' +
                           `${orderItems.replace(/[<>]/g, '')}\n\n` +
                           '💬 <b>Комментарий:</b> ' + order.comment.replace(/[<>]/g, '') + '\n\n' +
                           `💰 <b>Итого к оплате:</b> <code>${total}₽</code>\n\n` +
                           `⏰ ${new Date().toLocaleString('ru-RU')}`;
        
        // Send notification to admin
        await bot.sendMessage(adminChatId, adminMessage, { parse_mode: 'HTML' });
        
        // Send notification to group
        const groupMessage = `🛍 <b>НОВЫЙ ЗАКАЗ #${orders.length}</b> 🛍\n\n` +
                          `👤 <b>Заказчик:</b> ${msg.from.first_name || 'Не указано'} ${msg.from.last_name || ''} (@${msg.from.username || 'нет'})\n` +
                          `📅 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}\n\n` +
                          `📦 <b>Состав заказа:</b>\n${orderItems.replace(/[<>]/g, '')}\n\n` +
                          `💰 <b>Итого:</b> <code>${total}₽</code>\n` +
                          `💬 <b>Комментарий:</b> ${order.comment.replace(/[<>]/g, '')}`;
        
        await bot.sendMessage(groupChatId, groupMessage, { parse_mode: 'HTML' });
        
        // Confirm order to user
        const menu = {
            reply_markup: {
                keyboard: [
                    ['🛒 Каталог'],
                    ['ℹ️ О нас']
                ],
                resize_keyboard: true
            }
        };
        
        const userMessage = `✅ <b>Спасибо за заказ, ${msg.from.first_name || 'друг'}!</b>\n\n` +
                          'Ваш заказ принят в обработку. Наш менеджер свяжется с вами в ближайшее время.\n\n' +
                          `📦 <b>Номер вашего заказа:</b> #${orders.length}\n` +
                          `💬 <b>Ваш комментарий:</b> ${user.comment === 'Без комментария' ? 'не указан' : user.comment}\n\n` +
                          'Для уточнения деталей заказа вы всегда можете обратиться к менеджеру @Ferb_manger02';
        
        await bot.sendMessage(chatId, userMessage, { parse_mode: 'HTML', ...menu });
    }
});

bot.onText(/❌ Очистить корзину/, (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    
    user.cart = [];
    bot.sendMessage(chatId, 'Корзина очищена!');
});

// Handle about
bot.onText(/ℹ️ О нас/, (msg) => {
    const chatId = msg.chat.id;
    const aboutText = '🌟 <b>О FerbShop</b>\n\n' +
                     '🛍 <b>Наш магазин предлагает:</b>\n' +
                     '• Качественные товары для вейпинга\n' +
                     '• Широкий ассортимент\n' +
                     '• Доступные цены\n' +
                     '• Гарантия качества\n\n' +
                     '💳 <b>Способы оплаты</b>\n' +
                     '💰 Наличными при встрече с менеджером\n\n' +
                     '📍 <b>Наши контакты</b>\n' +
                     '📢 Официальный канал: https://t.me/FerbshopPP\n\n' +
                     '👨‍💼 <b>Менеджер:</b>\n' +
                     '• @Ferb_manger02\n\n' +
                     '💬 По всем вопросам обращайтесь к менеджеру\n' +
                     '⏰ Работаем круглосуточно\n\n' +
                     '💯 <b>Мы работаем для вас!</b>';
    
    const menu = {
        reply_markup: {
            keyboard: [
                ['🛒 Каталог'],
                ['🔙 Назад']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, aboutText, { 
        ...menu,
        parse_mode: 'HTML'
    });
});

console.log('Бот запущен и готов к работе!');
