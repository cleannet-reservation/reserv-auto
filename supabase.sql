create extension if not exists pgcrypto;
create table clients(id uuid primary key default gen_random_uuid(), name text not null, code text unique not null, contact text, created_at timestamptz default now());
create table trucks(id uuid primary key default gen_random_uuid(), client_id uuid references clients on delete cascade, plate text not null, type text);
-- Un créneau = une demi-journée (matin ou après-midi), une seule fois par jour
create table slots(id uuid primary key default gen_random_uuid(), day date not null, period text not null check (period in ('matin','apres-midi')), unique (day, period));
create table bookings(id uuid primary key default gen_random_uuid(), client_id uuid references clients on delete cascade, slot_id uuid references slots on delete cascade, place text, notes text,
 group_id uuid not null default gen_random_uuid(), is_extra boolean not null default false, full_day boolean not null default false,
 recurrence text not null default 'none' check (recurrence in ('none','2weeks','monthly')),
 status text not null default 'demande' check (status in ('demande','confirme','refuse','fait','annule')), created_at timestamptz default now());
-- Une demi-journée ne peut avoir qu'une seule réservation active : elle est bloquée pour les autres clients
-- Une réservation peut contenir plusieurs camions
create table booking_trucks(booking_id uuid references bookings on delete cascade, truck_id uuid references trucks on delete cascade, primary key (booking_id, truck_id));
create unique index one_active_booking_per_slot on bookings(slot_id) where status in ('demande','confirme');

alter table clients enable row level security; alter table trucks enable row level security;
alter table slots enable row level security; alter table bookings enable row level security; alter table booking_trucks enable row level security;
create policy admin_all on clients for all to authenticated using (true) with check (true);
create policy admin_all on trucks for all to authenticated using (true) with check (true);
create policy admin_all on slots for all to authenticated using (true) with check (true);
create policy admin_all on bookings for all to authenticated using (true) with check (true);
create policy admin_all on booking_trucks for all to authenticated using (true) with check (true);

create or replace function client_login(p_code text) returns json language sql security definer set search_path=public as $$
 select json_build_object('id',c.id,'name',c.name,'trucks',coalesce((select json_agg(json_build_object('id',t.id,'plate',t.plate,'type',t.type) order by t.plate) from trucks t where t.client_id=c.id),'[]'::json))
 from clients c where c.code=p_code $$;
create or replace function client_slots(p_code text) returns setof slots language sql security definer set search_path=public as $$
 select s.* from slots s where s.day>=current_date and exists(select 1 from clients where code=p_code)
 and not exists(select 1 from bookings b where b.slot_id=s.id and b.status in ('demande','confirme')) order by s.day, s.period='apres-midi' $$;
create or replace function client_bookings(p_code text) returns json language sql security definer set search_path=public as $$
 select coalesce(json_agg(json_build_object('id',b.id,'status',b.status,'place',b.place,'recurrence',b.recurrence,'full_day',b.full_day,'plates',(select coalesce(json_agg(t.plate order by t.plate),'[]'::json) from booking_trucks bt join trucks t on t.id=bt.truck_id where bt.booking_id=b.id),'day',s.day,'period',s.period) order by s.day desc, s.period),'[]'::json)
 from bookings b join clients c on c.id=b.client_id join slots s on s.id=b.slot_id where c.code=p_code and not b.is_extra $$;
drop function if exists client_book(text,uuid,uuid,text,text,text);
-- Règle : jusqu'à 3 camions par demi-journée ; au-delà, la journée entière est bloquée (changer le 3 ci-dessous pour modifier)
create or replace function client_book(p_code text,p_trucks uuid[],p_slot uuid,p_place text,p_rec text,p_notes text) returns void language plpgsql security definer set search_path=public as $$
declare cid uuid; bid uuid; gid uuid; d date; per text; s2 uuid; begin
 select id into cid from clients where code=p_code; if cid is null then raise exception 'Code invalide'; end if;
 if coalesce(array_length(p_trucks,1),0)=0 then raise exception 'Aucun camion'; end if;
 if exists(select 1 from unnest(p_trucks) u where not exists(select 1 from trucks where id=u and client_id=cid)) then raise exception 'Camion invalide'; end if;
 select day, period into d, per from slots where id=p_slot; if d is null then raise exception 'Créneau invalide'; end if;
 if array_length(p_trucks,1) > 3 then
  select id into s2 from slots where day=d and period = case when per='matin' then 'apres-midi' else 'matin' end;
  if s2 is null then raise exception 'Journée indisponible'; end if;
  insert into bookings(client_id,slot_id,place,recurrence,notes,full_day) values(cid,p_slot,p_place,p_rec,p_notes,true) returning id, group_id into bid, gid;
  insert into bookings(client_id,slot_id,place,recurrence,notes,group_id,is_extra,full_day) values(cid,s2,p_place,'none',p_notes,gid,true,true);
 else
  insert into bookings(client_id,slot_id,place,recurrence,notes) values(cid,p_slot,p_place,p_rec,p_notes) returning id into bid;
 end if;
 insert into booking_trucks(booking_id,truck_id) select bid,u from unnest(p_trucks) u; end $$;
create or replace function client_cancel(p_code text,p_booking uuid) returns void language sql security definer set search_path=public as $$
 update bookings set status='annule' where status in ('demande','confirme') and group_id=(select b.group_id from bookings b join clients c on c.id=b.client_id where b.id=p_booking and c.code=p_code) $$;
grant execute on function client_login,client_slots,client_bookings,client_book,client_cancel to anon, authenticated;

-- Le client ajoute lui-même ses camions
create or replace function client_add_truck(p_code text,p_plate text,p_type text) returns void language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
 select id into cid from clients where code=p_code; if cid is null then raise exception 'Code invalide'; end if;
 if length(trim(p_plate))=0 then raise exception 'Plaque vide'; end if;
 if exists(select 1 from trucks where client_id=cid and plate=upper(trim(p_plate))) then raise exception 'Déjà enregistré'; end if;
 insert into trucks(client_id,plate,type) values(cid,upper(trim(p_plate)),nullif(trim(p_type),'')); end $$;
grant execute on function client_add_truck(text,text,text) to anon, authenticated;
