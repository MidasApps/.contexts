-- Substitui ${PROJECT_ID}, ${BQ_LOCATION}, ${CLIENT} (segmento normalizado,
-- sem hifen) e ${CLIENT_ID} (id canonico do cadastro, usado so no label).
CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.dataviz_bqml_${CLIENT}`
  OPTIONS (
    location = '${BQ_LOCATION}',
    default_table_expiration_ms = NULL,
    labels = [('owner', 'dataviz-bqml'), ('tenant', '${CLIENT_ID}')]
  );
