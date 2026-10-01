import api from '../../../services/reference-api/dist/index.js'
const server=api.createServer()
const base=await server.listen({host:'127.0.0.1',port:0})
process.send({base})
process.once('SIGTERM',async()=>{await server.close();process.exit(0)})
