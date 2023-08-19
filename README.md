Event24 is an event management website. It can be used by the various clubs in an institute to organise events.
The users are informed as well as reminded through email. To setup the website locally, follow these steps :

1. Clone the repository <br />
   ```bash
   git clone https://github.com/Kandarp08/Event24.git

2. Install the following packages using the command <br />
   npm install <package_name> <br />

   i. express <br />
   ii. ejs <br />
   iii. dotenv <br />
   iv. mongodb <br />
   v. cookie-parser <br />
   vi. express-session <br />
   vii. body-parser <br />
   viii. multer <br />
   ix. nodemailer <br />
   x. node-cron <br />

3. Create the .env file. See .env.example to know more.

4. Go to cloud.mongodb.com and create a new cluster. Get the uri from Deployment/Database/Connect/Drivers.

5. Create a database "institute_data" and inside it a collection "institutes". Add a document to the collection 
   "institutes" with the following attributes :

   { <br />
        name: institute name <br />
        categories: string array containing names of all the clubs <br />
        events_id: 1 (Int32) <br />
        events: empty array <br />
   }

   This completes the addition of the institute to the database.

6. Create another database "userdata" and inside it a collection "users". Add a document for admin of the institute
   with the following attributes :

   { <br />
        username: admin username <br />
        password: admin password <br />
        email: admin email <br />
        admin: institute name <br />
        myevents_id: 1 (Int32) <br />
        myevents: empty array <br />
   }

   This completes the registration of the admin. No separate registration is required for the admin.

7. Start the server <br />
   ```bash
   node index.js