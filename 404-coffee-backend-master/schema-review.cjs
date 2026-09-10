require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const {Prisma}=require('@prisma/client');
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000,query_timeout:8000});
(async()=>{
 const rows=(await pool.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1',['public'])).rows;
 const names=['User','AuthSession','EmployeeDevice','Attendance','UserPageAccess','Supplier','SupplierTransaction','RawMaterial','RawMaterialBatch','Product','ProductType','ProductSize','ProductAddon','ProductTypeIngredient','ProductSizeIngredient'];
 const result=Prisma.dmmf.datamodel.models.filter(m=>names.includes(m.name)).map(m=>{
 const table=m.dbName||m.name; const cols=rows.filter(r=>r.table_name===table).map(r=>r.column_name);
 return {model:m.name,table,exists:cols.length>0,missingColumns:m.fields.filter(f=>f.kind!=='object'&&!cols.includes(f.dbName||f.name)).map(f=>f.dbName||f.name)};
 });
 console.log(JSON.stringify(result,null,2));
})().catch(e=>console.log(JSON.stringify({error:e.code||'connection error'}))).finally(()=>pool.end());
