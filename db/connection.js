import mongoose from "mongoose";

const connection = async ()=>{
    return await mongoose.connect(process.env.MONGO_URI)
    .then(()=> console.log(`connected on ...... `))
    .catch(err=>console.log(`fail to connect `))
}

export default connection;