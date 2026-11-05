create or replace function client_add_truck(p_code text,p_plate text,p_type text) returns void language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
 select id into cid from clients where code=p_code; if cid is null then raise exception 'Code invalide'; end if;
 if length(trim(p_plate))=0 then raise exception 'Plaque vide'; end if;
 if exists(select 1 from trucks where client_id=cid and plate=upper(trim(p_plate))) then raise exception 'Déjà enregistré'; end if;
 insert into trucks(client_id,plate,type) values(cid,upper(trim(p_plate)),nullif(trim(p_type),'')); end $$;
grant execute on function client_add_truck(text,text,text) to anon, authenticated;
