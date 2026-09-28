# DF Elements shop: setup guide

This is Phase 1 of the DF Elements shop: the shop front, cart, EFT checkout, customer accounts and the admin back office. Follow the steps in order. It takes about 30 minutes.

## If you already set up the shop before the Workshop Craft look

1. Upload the new files to GitHub the same way as in Step 2 (drag everything in again and commit directly to main). The new files replace the old ones and Vercel updates the shop by itself.
2. In Supabase, open **SQL Editor**, paste in `supabase/04_workshop_look_images.sql` and press **Run**. This points the designs at the new photos with see-through backgrounds.

If you are setting up for the first time, you can skip this section. The new photos are already in `02_seed.sql`.

## Step 1: Create the database in Supabase

1. In Supabase, click **New project**. Name it **DF Elements**. Pick the same region you used for your other projects and save the database password somewhere safe.
2. When the project is ready, open **SQL Editor**, click **New query**, paste in the whole of `supabase/01_schema.sql` and press **Run**. It should finish with "Success. No rows returned".
3. Open a new query, paste in `supabase/02_seed.sql` and press **Run**. This loads the 43 designs, 8 themes, 7 gift sets and 3 delivery options (with sample prices).
4. Go to **Authentication**, then **Users**, then **Add user**, then **Create new user**. Enter your email and a password, and tick **Auto Confirm User**.
5. Open `supabase/03_first_admin.sql`, replace `YOUR EMAIL HERE` with that same email, paste it into a new query and press **Run**. It should show one row with the username **mary**.
6. Go to **Project Settings**, then **API** (called **API Keys** in newer projects). Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key). You need both in Step 3.

## Step 2: Put the code on GitHub

1. On GitHub, create a new **private** repository called `df-elements-shop`. Do not add a README.
2. On the empty repository page, click **uploading an existing file**.
3. Unzip the file I sent you. Open the `df-elements-shop` folder, select everything inside it (all files and folders) and drag it onto the GitHub upload page.
4. Choose **Commit directly to the main branch** and press **Commit changes**.

## Step 3: Put the shop online with Vercel

1. In Vercel, click **Add New**, then **Project**, and import `df-elements-shop` from GitHub.
2. Vercel recognises it as a **Vite** project. Leave the build settings as they are.
3. Open **Environment Variables** and add two:
   * `VITE_SUPABASE_URL` with your Project URL from Step 1
   * `VITE_SUPABASE_ANON_KEY` with your anon or publishable key from Step 1
4. Press **Deploy**. When it finishes, Vercel gives you a web address ending in `.vercel.app`. That is your shop.

## Step 4: Tell Supabase where the shop lives

1. In Supabase, go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to your Vercel address, for example `https://df-elements-shop.vercel.app`.
3. Under **Redirect URLs**, add the same address followed by `/**`.

This makes the "confirm your email" and "reset your password" links for customers open your shop.

## Step 5: First look and your settings

1. Open your shop address. You should see the home page with all the designs.
2. Open your shop address followed by `/admin` (for example `https://df-elements-shop.vercel.app/admin`). Sign in with the username **mary** and the password from Step 1.
3. Go to **Settings** and fill in your bank details, business address, email and phone. The bank details are shown to customers after they order and on pro forma invoices.
4. Go to **Products** and type in your real prices, wholesale prices and stock. Open any design to add its size.
5. Place a test order in the shop, then find it in **Orders** and walk it through: EFT received, printed and packed, shipped. Cancel it at the end so the stock goes back.

## Phase 2: wholesale

1. Upload the new files to GitHub: drag the `src` folder, the `supabase` folder and `SETUP.md` onto the repository's upload page, choose **Commit directly to the main branch** and commit. Vercel updates the shop by itself.
2. In Supabase, open **SQL Editor**, paste in `supabase/05_wholesale.sql` and press **Run**. It moves your trade prices into their own protected table and adds wholesale clients, wholesale orders and branding requests.
3. In the admin, go to **Settings** and check **Wholesale: free courier on orders from (R)**. It starts at R1 500.

### How wholesale works

1. A business applies on the **Wholesale** page and chooses a password. They can sign in, but see no trade prices until you approve them.
2. In admin, open **Wholesale**, then **Applications**, and press **Approve**. Let them know by WhatsApp or email that they can sign in.
3. They order at trade prices and get a pro forma invoice straight away. Orders of R1 500 or more have free courier.
4. The order shows in **Orders** with a **Wholesale** label and a WS number. For each design, set how many come **from stock**. The rest is printed.
5. When the EFT reflects, press **EFT received**. When you mark it **printed and packed**, the from stock pieces come off your stock count.
6. Branding requests (client logos) are under **Wholesale**, then **Branding requests**. Add your quote as a note, which the client can see, and mark it **Quote sent**.
7. Trade prices are in the **Wholesale (R)** column in **Products**. A design with no trade price shows as "On request" to clients.

## Q and A, expenses and reports

1. Upload the **src** folder, the **supabase** folder and this file to GitHub as before, and commit to main.
2. In Supabase, open the **SQL Editor**, paste in **supabase/06_qa_reports_expenses.sql** and click **Run**.
3. In admin, open **Settings**. If DF Elements is VAT registered, switch on **Charging VAT** and save. Orders placed from then on show as tax invoices with the VAT amount. You can switch it off again at any time.
4. In **Products**, fill in **Your cost (R)** on each product so the reports can show your profit per item.

### Where to find things

* **Q and A** in admin: add, edit, reorder, hide or delete questions. Customers see them on the Help page.
* **Expenses**: add each expense with a photo or PDF of the receipt. The 15% button works out the VAT for you. Set monthly budgets under **Budgets and categories**. Things you pay every month go under **Recurring** and are added by themselves on the right day.
* **Reports**: choose a period at the top, then pick a report. Each one has **Download CSV** for your bookkeeper and **Print**.

## New price list, product types and phone stand photos

1. Upload the **src**, **supabase** and **public** folders and this file to GitHub, and commit to main.
2. In the Supabase **SQL Editor**, run **supabase/07_product_types_prices.sql** (after 06).
3. It sets coasters to R12 (trade R7) and phone stands to R25 (trade R14,50), clears the old specials, and adds the other products from your price list as made to order items.
4. Product types (Coasters, Phone stands, Decor boards, Home and kitchen, Gifts and keepsakes) can be renamed, hidden or added under **Settings**, then **Product types**.
5. New products show "Photo coming soon" until you upload a photo in **Products**. Anything marked **Check the name** is worth a quick look.

## When the domain has moved to xneelo

1. In Vercel, open the project, then **Settings**, then **Domains**, and add your domain.
2. Vercel shows you the DNS records to add. Add them in the xneelo control panel under the domain's DNS settings.
3. Once it shows as valid in Vercel, change the **Site URL** and **Redirect URLs** in Supabase (Step 4) to your own domain.

## How orders work

1. A customer checks out and chooses a delivery option. The database works out every price and reduces the stock.
2. They see your bank details and their order number to use as the reference. The order shows in admin as **Awaiting EFT**.
3. When the money reflects, open the order and press **EFT received**. It moves to **Paid, to print** and appears in the print queue on the dashboard.
4. Custom photo orders need **Proof approved** before they can be marked as printed. The customer's photo opens from the order.
5. Print the packing list and courier label, add the tracking number, then mark it shipped and later delivered.
6. **Cancel this order** puts the stock back on the shelf.

## Still to come

* **Order emails** (confirmation with bank details, payment received, shipped) through Resend. This needs your domain on xneelo so the emails come from your own address.
* **Phase 3:** rewards points and the AI listing helper.
* **Before launch:** your story, delivery and returns, terms and conditions, and a POPIA privacy policy. They show as placeholders on the Our story page for now.
