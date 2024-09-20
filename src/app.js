import  express  from 'express';
import cors from "cors";
import cookieParser from 'cookie-parser';

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN,
  Credentials: true
}))

//Express config (these 3 config is imp)
app.use((express.json({limit: "20kb"})))
app.use(express.urlencoded({extended: true, limit: "20kb"})) // taking data from url
app.use(express.static("public"))
 
app.use(cookieParser())




export { app }
