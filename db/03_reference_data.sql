-- =====================================================================
-- TriageDesk : 03_reference_data.sql
-- Lookup data. Users, protocols, callers and cases are loaded by
-- scripts/seed.ts because they need bcrypt hashes and embeddings.
-- =====================================================================

INSERT INTO district (name) VALUES
  ('Bengaluru Urban'), ('Bengaluru Rural'), ('Bidar'), ('Kalaburagi'), ('Belagavi'),
  ('Mysuru'), ('Mangaluru'), ('Hubballi-Dharwad'), ('Ballari'), ('Raichur'),
  ('Tumakuru'), ('Shivamogga'), ('Vijayapura'), ('Hassan'), ('Udupi');

INSERT INTO symptom (name, body_system, is_red_flag) VALUES
  ('Fever',                       'General',        FALSE),
  ('High fever above 103F',       'General',        TRUE),
  ('Headache',                    'Neurological',   FALSE),
  ('Seizure',                     'Neurological',   TRUE),
  ('Confusion or drowsiness',     'Neurological',   TRUE),
  ('Cough',                       'Respiratory',    FALSE),
  ('Breathlessness',              'Respiratory',    TRUE),
  ('Sore throat',                 'Respiratory',    FALSE),
  ('Chest pain',                  'Cardiac',        TRUE),
  ('Palpitations',                'Cardiac',        FALSE),
  ('Vomiting',                    'Gastrointestinal', FALSE),
  ('Loose motions',               'Gastrointestinal', FALSE),
  ('Blood in stool or vomit',     'Gastrointestinal', TRUE),
  ('Abdominal pain',              'Gastrointestinal', FALSE),
  ('Dehydration signs',           'General',        FALSE),
  ('Rash',                        'Skin',           FALSE),
  ('Joint or body pain',          'Musculoskeletal', FALSE),
  ('Bleeding in pregnancy',       'Maternal',       TRUE),
  ('Reduced fetal movement',      'Maternal',       TRUE),
  ('Swelling of feet or face',    'Maternal',       FALSE),
  ('Low mood or anxiety',         'Mental',         FALSE),
  ('Thoughts of self-harm',       'Mental',         TRUE),
  ('Snake or animal bite',        'Injury',         TRUE),
  ('Burn',                        'Injury',         FALSE),
  ('Suspected poisoning',         'Toxicology',     TRUE),
  ('Dizziness',                   'General',        FALSE),
  ('High blood sugar reading',    'Endocrine',      FALSE),
  ('Medication query',            'Information',    FALSE);
