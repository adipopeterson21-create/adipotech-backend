
const { sequelize } = require('./models');
(async ()=>{
  try{ await sequelize.sync({ alter:true }); console.log('Database migrated.'); process.exit(0); }catch(e){ console.error(e); process.exit(1); }
})();
