
const { Sequelize, DataTypes } = require('sequelize');
const DATABASE_URL = process.env.DATABASE_URL || '';
let sequelize;
if(DATABASE_URL && DATABASE_URL.trim() !== ''){
  sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging:false });
}else{
  sequelize = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite', logging:false });
}

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true },
  email: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
  role: { type: DataTypes.STRING, defaultValue: 'user' },
  premium: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Content = sequelize.define('Content', {
  title: DataTypes.STRING, type: DataTypes.STRING, url: DataTypes.STRING, description: DataTypes.TEXT, premium: { type: DataTypes.BOOLEAN, defaultValue:false }
});

const Comment = sequelize.define('Comment', { userId: DataTypes.INTEGER, contentId: DataTypes.INTEGER, text: DataTypes.TEXT });

module.exports = { sequelize, User, Content, Comment };
