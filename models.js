const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Use SQLite for simplicity (you can change to PostgreSQL via env vars)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false,
});

// === Define Models ===
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING(200), allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'user' },
  premium: { type: DataTypes.BOOLEAN, defaultValue: false },
});

const Content = sequelize.define('Content', {
  title: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  fileUrl: DataTypes.STRING,
  type: DataTypes.STRING,
  price: { type: DataTypes.FLOAT, defaultValue: 0 },
  premiumOnly: { type: DataTypes.BOOLEAN, defaultValue: false },
});

const Comment = sequelize.define('Comment', {
  text: { type: DataTypes.TEXT, allowNull: false },
});

// === Associations ===
User.hasMany(Content, { onDelete: 'CASCADE' });
Content.belongsTo(User);

User.hasMany(Comment, { onDelete: 'CASCADE' });
Comment.belongsTo(User);

Content.hasMany(Comment, { onDelete: 'CASCADE' });
Comment.belongsTo(Content);

// === Exports ===
module.exports = { sequelize, User, Content, Comment };
