const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());
require("dotenv").config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nxaiqcz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function dbConnect() {
  try {
    client.connect();
    console.log("database is connected");
  } catch (error) {
    console.log(`database cannot connected for ${error} `);
  }
}
dbConnect();

//collections
const appointmentOptionCollection = client
  .db("doctorsPortal")
  .collection("appointmentOptions");

const bookingsCollection = client.db("doctorsPortal").collection("bookings");

app.get("/appointmentOptions", async (req, res) => {
  try {
    const date = req.query.date;
    const query = {};
    const options = await appointmentOptionCollection.find(query).toArray();
    //get bookings of the provided date
    const bookingQuery = { appointmentDate: date };
    const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

    //
    options.forEach((option) => {
      const optionBooked = alreadyBooked.filter(
        (book) => book.treatment === option.name
      );
      const bookedSlots = optionBooked.map((book) => book.slot);
      const remainingSlots = option.slots.filter(
        (slot) => !bookedSlots.includes(slot)
      );
      option.slots = remainingSlots;
      // console.log(bookedSlots);
    });

    res.send(options);
  } catch (error) {
    res.send({
      success: false,
      error: error.message,
    });
  }
});

// Advance,

app.get("/v2/appointmentOptions", async (req, res) => {
  const date = req.query.date;
  const options = await appointmentOptionCollection.aggregate([
    {
      $lookup: {
        from: "bookings",
        localField: "name",
        foreignField: "treatment",
        pipeline: [
          {
            $match:{
              $expr:{  
                $eq:[ '$appointmentDate',date ]
              }
            }
          }
        ],
        as: "booked",
      },
    },
    {
      $project:{
         name: 1,
         slots:1,
         booked:{
          $map:{
            input: '$booked',
            as:'book',
            in:'$$book.slot'
          }
         }
      }
    },
    {
      $project:{
        name:1,
        slots:{
          $setDifference:['$slots','$booked']
        }
      }
    }
  ]).toArray();
  res.send(options);
});

/*
API NAMING CONVENTION 

bookings
app.get('/bookings)
app.get('/bookings/:id)
app.post('/bookings)
app.patch('/bookings/:id)
app.delete('/bookings/:id)
*/

app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    const result = await bookingsCollection.insertOne(booking);
    res.send(result);
  } catch (error) {
    res.send({
      success: false,
      error: error.message,
    });
  }
});

app.get("/", async (req, res) => {
  res.send("doctors portal server is running ");
});

app.listen(port, () => {
  console.log(`doctors portal runing on ${port}`);
});
