-- Phase 6/7: client products + product asset references, client AI knowledge,
-- global HATOG configuration and global negative prompts.

-- ---------------------------------------------------------------------------
-- Products (client-scoped)
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  sku text check (char_length(sku) <= 100),
  product_url text check (product_url ~* '^https?://'),
  short_description text check (char_length(short_description) <= 500),
  full_description text check (char_length(full_description) <= 10000),
  price numeric(12, 2) check (price >= 0),
  discount_price numeric(12, 2) check (discount_price >= 0),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  features text[] not null default '{}' check (cardinality(features) <= 30),
  benefits text[] not null default '{}' check (cardinality(benefits) <= 30),
  target_customer text check (char_length(target_customer) <= 2000),
  category text check (char_length(category) <= 100),
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  brand_name text check (char_length(brand_name) <= 200),
  brand_colors text[] not null default '{}' check (cardinality(brand_colors) <= 10),
  cta text check (char_length(cta) <= 200),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_price is null or price is null or discount_price <= price),
  unique (client_id, sku),
  -- Target for product_assets' composite FK (keeps asset.client_id == product.client_id).
  unique (id, client_id)
);

create index products_client_status_idx on public.products (client_id, status);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- References to files that live in Google Drive (or another https location).
-- Only metadata is stored; files are never duplicated into the database.
create table public.product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  client_id uuid not null,
  asset_type text not null check (asset_type in ('image', 'video', 'document', 'other')),
  drive_file_id text check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  url text check (url ~* '^https://' and char_length(url) <= 2000),
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  foreign key (product_id, client_id) references public.products (id, client_id) on delete cascade,
  check (drive_file_id is not null or url is not null)
);

create index product_assets_product_idx on public.product_assets (product_id);
create index product_assets_client_idx on public.product_assets (client_id);

-- ---------------------------------------------------------------------------
-- Client AI knowledge (one structured record per client)
-- ---------------------------------------------------------------------------

create table public.client_ai_knowledge (
  client_id uuid primary key references public.clients (id) on delete cascade,
  business_context text check (char_length(business_context) <= 10000),
  customer_profile text check (char_length(customer_profile) <= 10000),
  product_knowledge text check (char_length(product_knowledge) <= 10000),
  brand_voice text check (char_length(brand_voice) <= 10000),
  selling_points text check (char_length(selling_points) <= 10000),
  objections text check (char_length(objections) <= 10000),
  competitor_notes text check (char_length(competitor_notes) <= 10000),
  offer_rules text check (char_length(offer_rules) <= 10000),
  additional_instructions text check (char_length(additional_instructions) <= 10000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

create trigger client_ai_knowledge_set_updated_at
  before update on public.client_ai_knowledge
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Global HATOG framework (Super Admin controlled, not client-specific)
-- ---------------------------------------------------------------------------

create table public.hatog_stages (
  key text primary key check (key in ('hook', 'feature', 'trust', 'offer', 'gift')),
  letter text not null check (letter in ('H', 'A', 'T', 'O', 'G')),
  position smallint not null unique check (position between 1 and 5),
  name text not null check (char_length(name) between 1 and 100),
  objective text check (char_length(objective) <= 2000),
  description text check (char_length(description) <= 5000),
  audience text check (char_length(audience) <= 2000),
  content_direction text check (char_length(content_direction) <= 5000),
  ad_direction text check (char_length(ad_direction) <= 5000),
  ai_instructions text check (char_length(ai_instructions) <= 5000),
  example_ideas text[] not null default '{}' check (cardinality(example_ideas) <= 20),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

create trigger hatog_stages_set_updated_at
  before update on public.hatog_stages
  for each row execute function public.set_updated_at();

insert into public.hatog_stages (key, letter, position, name, objective, ai_instructions) values
  ('hook', 'H', 1, 'Hook',
   'Capture attention in the first few seconds with a message tied to a real, local pain point.',
   E'Lead with a specific problem the audience recognizes, not a generic claim.\nAvoid stock-template openings — reference something locally relevant.\nKeep the first line short enough to read before someone scrolls past.'),
  ('feature', 'A', 2, 'Feature',
   'Show the product doing its job clearly and honestly.',
   E'Demonstrate the product in real use, not just staged photography.\nHighlight the one or two features that matter most to this audience.\nNever overstate specifications or capabilities.'),
  ('trust', 'T', 3, 'Trust',
   'Provide the reassurance Bangladeshi buyers need before they commit — the step most funnels skip.',
   E'Use real customer reviews, delivery proof, and responsive presence.\nAddress common doubts directly (authenticity, delivery, returns).\nAvoid manufactured testimonials or unverifiable claims.'),
  ('offer', 'O', 4, 'Offer',
   'Present a clear, honest offer that removes hesitation.',
   E'State the offer plainly — price, what''s included, and any conditions.\nUse urgency only when it reflects a real, verifiable constraint.\nNever promise guaranteed outcomes or results.'),
  ('gift', 'G', 5, 'Gift',
   'Add a value-driven incentive that rewards the decision and opens the door to repeat business.',
   E'Tie the gift to genuine value, not just a discount code.\nUse it to start the next purchase cycle, not only to close this one.\nKeep the gift sustainable — don''t erode margin on every order.');

-- ---------------------------------------------------------------------------
-- Global negative prompts (Super Admin controlled)
-- ---------------------------------------------------------------------------

create table public.negative_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(prompt) between 1 and 500),
  category text not null default 'general' check (category in ('general', 'image', 'video', 'copy')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

create index negative_prompts_enabled_idx on public.negative_prompts (enabled, category);

create trigger negative_prompts_set_updated_at
  before update on public.negative_prompts
  for each row execute function public.set_updated_at();

insert into public.negative_prompts (prompt, category) values
  ('Do not invent product features.', 'general'),
  ('Do not change product proportions.', 'image'),
  ('Do not create incorrect product colors.', 'image'),
  ('Do not add fake claims.', 'copy'),
  ('Do not add unwanted product elements.', 'image'),
  ('Do not add watermarks.', 'image'),
  ('Avoid unrealistic product presentation.', 'general');

-- ---------------------------------------------------------------------------
-- RLS
-- Client-scoped tables: super admin full access; active sub-admins read-only for
-- clients assigned to them. Global tables: super admin only. Anon: nothing.
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;
alter table public.product_assets enable row level security;
alter table public.client_ai_knowledge enable row level security;
alter table public.hatog_stages enable row level security;
alter table public.negative_prompts enable row level security;

create policy "super admins manage products"
  on public.products for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "sub-admins view products of assigned clients"
  on public.products for select to authenticated
  using (public.is_admin() and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = products.client_id and ca.admin_user_id = auth.uid()
  ));

create policy "super admins manage product assets"
  on public.product_assets for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "sub-admins view product assets of assigned clients"
  on public.product_assets for select to authenticated
  using (public.is_admin() and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = product_assets.client_id and ca.admin_user_id = auth.uid()
  ));

create policy "super admins manage client ai knowledge"
  on public.client_ai_knowledge for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "sub-admins view ai knowledge of assigned clients"
  on public.client_ai_knowledge for select to authenticated
  using (public.is_admin() and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = client_ai_knowledge.client_id and ca.admin_user_id = auth.uid()
  ));

create policy "super admins manage hatog stages"
  on public.hatog_stages for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "super admins manage negative prompts"
  on public.negative_prompts for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
