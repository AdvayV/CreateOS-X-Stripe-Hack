import fs from 'node:fs/promises';import path from 'node:path';import{spawn}from'node:child_process';
const dir=path.resolve('.rehearsal/deploy-src');await fs.mkdir(dir,{recursive:true});
for(const name of ['package.json','package-lock.json','Dockerfile','.dockerignore','index.html','src','public','server','shop','core','candidates','runtime','scenarios','scripts'])await fs.cp(path.resolve(name),path.join(dir,name),{recursive:true,force:true});
// Only this explicit source allowlist is uploaded. Never copy local credentials.
const child=spawn('createos',['deploy','--project','c57592e3-ea17-4eb8-943b-cfb01c12d708','--dir',dir],{stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>process.exit(code||0));
