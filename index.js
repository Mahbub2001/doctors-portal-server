const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nxaiqcz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

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
const usersCollection = client.db("doctorsPortal").collection("users");

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
  try {
    const date = req.query.date;
    const options = await appointmentOptionCollection
      .aggregate([
        {
          $lookup: {
            from: "bookings",
            localField: "name",
            foreignField: "treatment",
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$appointmentDate", date],
                  },
                },
              },
            ],
            as: "booked",
          },
        },
        {
          $project: {
            name: 1,
            slots: 1,
            booked: {
              $map: {
                input: "$booked",
                as: "book",
                in: "$$book.slot",
              },
            },
          },
        },
        {
          $project: {
            name: 1,
            slots: {
              $setDifference: ["$slots", "$booked"],
            },
          },
        },
      ])
      .toArray();
    res.send(options);
  } catch (error) {
    res.send({
      success: false,
      error: error.message,
    });
  }
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

app.get("/bookings", verifyJWT, async (req, res) => {
  try {
    const email = req.query.email;
    const decodedEmail = req.decoded.email;

    if (email !== decodedEmail) {
      return res.status(403).send({ message: "forbidden access" });
    }
    const query = { email: email };
    const bookings = await bookingsCollection.find(query).toArray();
    res.send(bookings);
  } catch (error) {
    console.log(error);
  }
});

app.get("/jwt", async (req, res) => {
  const email = req.query.email;
  const query = { email: email };
  const user = await usersCollection.findOne(query);
  if (user) {
    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
      expiresIn: "1h",
    });
    return res.send({ accessToken: token });
  }
  res.status(403).send({ accesToken: "" });
});

app.get("/users", async (req, res) => {
  const query = {};
  const users = await usersCollection.find(query).toArray();
  res.send(users);
});

app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    const query = {
      appointmentDate: booking.appointmentDate,
      email: booking.email,
      treatment: booking.treatment,
    };

    const alreadyBooked = await bookingsCollection.find(query).toArray();

    if (alreadyBooked.length) {
      const message = `You already have a booking on ${booking.appointmentDate}`;
      return res.send({ acknowledged: false, message });
    }

    const result = await bookingsCollection.insertOne(booking);
    res.send(result);
  } catch (error) {
    res.send({
      success: false,
      error: error.message,
    });
  }
});

app.get('/users/admin/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email }
  const user = await usersCollection.findOne(query);
  res.send({ isAdmin: user?.role === 'admin' });
})

app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    console.log(error);
  }
});

app.put("/users/admin/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: ObjectId(id) };
  const options = { upsert: true };
  const updatedDoc = {
    $set: {
      role: "admin",
    },
  };
  const result = await usersCollection.updateOne(filter, updatedDoc, options);
  res.send(result);
});

app.get("/", async (req, res) => {
  res.send("doctors portal server is running ");
});

app.listen(port, () => {
  console.log(`doctors portal runing on ${port}`);
});
