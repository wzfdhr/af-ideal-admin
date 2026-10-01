import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(fileURLToPath(new URL('../dist',import.meta.url)))
const port=Number(process.env.R1_PREVIEW_PORT||4175)
const upstream=new URL(process.env.R1_API_URL||'http://127.0.0.1:10888')
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://127.0.0.1:${port}`)
  if(url.pathname.startsWith('/api/')){
    const proxy=http.request({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,headers:{...req.headers,host:upstream.host}},response=>{ const deliver=()=>{if(!res.destroyed){res.writeHead(response.statusCode||502,response.headers);response.pipe(res)}}; if(req.method==='GET'&&url.pathname==='/api/leave-requests'&&Number(process.env.R1_READ_DELAY_MS)>0)setTimeout(deliver,Number(process.env.R1_READ_DELAY_MS));else deliver() })
    proxy.on('error',()=>{res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({code:502,data:null,message:'API 服务不可用'}))})
    req.pipe(proxy);return
  }
  let file
  try{
    file=path.resolve(root,'.'+decodeURIComponent(url.pathname))
    if(!file.startsWith(root+path.sep)||path.basename(file).startsWith('._'))file=path.join(root,'index.html')
    else if(!(await stat(file)).isFile())file=path.join(root,'index.html')
  }catch{file=path.join(root,'index.html')}
  try{const content=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(content)}
  catch{res.writeHead(503);res.end('请先构建前端')}
})
server.listen(port,'127.0.0.1',()=>process.stdout.write(`R1 production preview on http://127.0.0.1:${port}\n`))
process.once('SIGTERM',()=>server.close())
process.once('SIGINT',()=>server.close())
