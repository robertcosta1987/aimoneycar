# MONEYCAR AI — MAPA COMPLETO DE TABELAS E CAMPOS
# Cheat Sheet para IA: Pergunta Humana → Tabela.Campo no Banco

> Quando o usuário faz uma pergunta em linguagem natural, use este mapa para
> saber EXATAMENTE em qual tabela e campo buscar a resposta.

---

## 1. VEÍCULOS (tabela: `vehicles`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Veículo | "qual o ID desse carro?" |
| `dealership_id` | Revenda (FK) | "de qual loja é esse veículo?" |
| `plate` | Placa | "qual a placa?", "tem algum carro com placa X?" |
| `chassis` | Chassi / VIN | "qual o chassi?", "buscar por chassi" |
| `renavam` | Renavam | "qual o renavam?", "documento do veículo" |
| `brand` | Marca | "qual a marca?", "quantos VW temos?", "carros da Fiat" |
| `model` | Modelo | "qual o modelo?", "quantos Gol temos?", "lista de Onix" |
| `version` | Versão / Acabamento | "qual a versão?", "é 1.0 ou 1.6?" |
| `year_fab` | Ano de Fabricação | "de que ano é?", "carros fabricados em 2020" |
| `year_model` | Ano do Modelo | "qual ano modelo?", "veículos modelo 2021" |
| `color` | Cor | "qual a cor?", "tem carro branco?", "quantos pretos?" |
| `mileage` | Quilometragem (KM) | "quantos km rodou?", "carro com menor km", "km média do estoque" |
| `fuel` | Combustível | "é flex?", "quantos diesel temos?", "carros a gasolina" |
| `transmission` | Câmbio / Transmissão | "é automático ou manual?", "quantos automáticos?" |
| `purchase_price` | Valor de Compra (R$) | "quanto pagamos?", "preço de aquisição", "custo de compra" |
| `sale_price` | Valor de Venda (R$) | "por quanto está anunciado?", "preço de venda", "valor pedido" |
| `fipe_price` | Valor FIPE (R$) | "qual o preço FIPE?", "está acima ou abaixo da FIPE?" |
| `min_price` | Preço Mínimo (R$) | "qual o mínimo que posso vender?", "piso de preço" |
| `status` | Situação | "está disponível?", "foi vendido?", "está reservado?", "quantos disponíveis?" |
| `purchase_date` | Data da Compra / Entrada | "quando compramos?", "data de aquisição", "quando entrou no estoque?" |
| `sale_date` | Data da Venda | "quando vendeu?", "data de saída" |
| `days_in_stock` | Dias em Estoque (calculado) | "há quantos dias está parado?", "tempo em estoque", "carros críticos", "veículos há mais de 60 dias" |
| `supplier_name` | Fornecedor / Origem | "de quem compramos?", "quem vendeu pra gente?" |
| `customer_id` | Cliente (FK) | "quem comprou este carro?" |
| `photos` | Fotos | "tem foto?", "quantas fotos?" |
| `notes` | Observações | "tem alguma observação?", "notas sobre o carro" |
| `source` | Tipo de Entrada | "foi compra, troca ou consignação?", "origem do veículo" |
| `external_id` | ID Moneycar (sistema antigo) | "código no Moneycar original" |
| `created_at` | Data de Cadastro | "quando foi cadastrado no sistema?" |
| `updated_at` | Última Atualização | "quando foi a última alteração?" |

**Valores do campo `status`:** `available` (disponível), `reserved` (reservado), `sold` (vendido), `consigned` (consignado)
**Valores do campo `source`:** `COMPRA`, `TROCA`, `CONSIGNAÇÃO`
**Valores do campo `fuel`:** `FLEX`, `GASOLINA`, `DIESEL`, `ELÉTRICO`, `HÍBRIDO`
**Valores do campo `transmission`:** `MANUAL`, `AUTOMÁTICO`, `CVT`

### Campos Calculados (não estão no banco, derivados em código):
| Cálculo | Fórmula | Perguntas que responde |
|---|---|---|
| Lucro Bruto | `sale_price - purchase_price - total_expenses` | "quanto lucramos?", "qual o lucro desse carro?" |
| Margem (%) | `(lucro / sale_price) * 100` | "qual a margem?", "margem de lucro" |
| Custo Total Real | `purchase_price + total_expenses` | "quanto gastamos no total?", "custo real" |
| Lucro por Dia | `lucro / days_in_stock` | "quanto lucra por dia parado?", "rentabilidade diária" |

---

## 2. DESPESAS (tabela: `expenses`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Despesa | "qual o ID dessa despesa?" |
| `dealership_id` | Revenda (FK) | "despesas de qual loja?" |
| `vehicle_id` | Veículo Relacionado (FK) | "despesas de qual carro?", "gastos do Gol placa X" |
| `category` | Categoria | "quanto gastamos com despachante?", "despesas por categoria", "total em lavagem" |
| `description` | Descrição | "o que foi feito?", "detalhes do gasto" |
| `amount` | Valor (R$) | "quanto custou?", "total de despesas", "gasto total" |
| `date` | Data da Despesa | "quando foi o gasto?", "despesas do mês", "gastos de janeiro" |
| `vendor_name` | Fornecedor | "quem fez o serviço?", "quanto pagamos ao Brisamar?", "gastos por fornecedor" |
| `payment_method` | Forma de Pagamento | "foi pago como?", "pagamentos por PIX" |
| `receipt_url` | Comprovante | "tem comprovante?", "recibo" |
| `created_by` | Criado por (FK) | "quem registrou essa despesa?" |
| `external_id` | ID Moneycar (sistema antigo) | "código no Moneycar original" |

**Categorias comuns:** `DESPACHANTE`, `LAVAGEM`, `CARTÓRIO`, `IPVA`, `COMBUSTÍVEL`, `FUNILARIA`, `ÓLEO`, `LAUDO`, `PNEU`, `VISTORIA`, `POLIMENTO`, `ELÉTRICA`, `SEGURO`, `PINTURA`, `MULTA`, `MECÂNICA`

---

## 3. VENDAS (tabela: `sales`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Venda | "qual o ID da venda?" |
| `dealership_id` | Revenda (FK) | "vendas de qual loja?" |
| `vehicle_id` | Veículo Vendido (FK) | "qual carro foi vendido?" |
| `customer_name` | Nome do Cliente | "quem comprou?", "nome do comprador" |
| `customer_phone` | Telefone do Cliente | "telefone do comprador" |
| `customer_email` | E-mail do Cliente | "email do cliente" |
| `customer_cpf` | CPF do Cliente | "CPF do comprador" |
| `sale_price` | Valor da Venda (R$) | "por quanto vendeu?", "faturamento", "receita" |
| `purchase_price` | Valor de Compra (R$) | "quanto pagamos nesse carro?" (snapshot) |
| `total_expenses` | Total de Despesas (R$) | "quanto gastamos nesse carro?" (snapshot) |
| `profit` | Lucro (R$) | "qual foi o lucro?", "quanto ganhamos?" |
| `profit_percent` | Margem de Lucro (%) | "qual a margem da venda?", "percentual de lucro" |
| `payment_method` | Forma de Pagamento | "foi à vista ou financiado?", "vendas por forma de pagamento" |
| `down_payment` | Valor de Entrada (R$) | "quanto deu de entrada?", "sinal pago" |
| `financing_bank` | Banco Financiador | "qual banco financiou?", "financiamento por qual banco?" |
| `sale_date` | Data da Venda | "quando vendeu?", "vendas do mês", "vendas de março" |
| `salesperson_id` | Vendedor (FK) | "quem vendeu?" |
| `salesperson_name` | Nome do Vendedor | "qual vendedor fechou?", "vendas por vendedor", "ranking de vendedores" |
| `notes` | Observações | "tem alguma nota sobre a venda?" |

---

## 4. CLIENTES (tabela: `customers`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Cliente | "qual o ID do cliente?" |
| `dealership_id` | Revenda (FK) | "clientes de qual loja?" |
| `external_id` | ID Moneycar (sistema antigo) | "código no Moneycar original" |
| `name` | Nome Completo | "qual o nome do cliente?", "buscar cliente por nome" |
| `phone` | Telefone | "qual o telefone?", "contato do cliente" |
| `email` | E-mail | "qual o email?" |
| `cpf` | CPF | "qual o CPF?", "buscar por CPF" |
| `cnpj` | CNPJ | "é pessoa jurídica?", "CNPJ do cliente" |
| `birth_date` | Data de Nascimento | "quando nasceu?", "aniversariantes do mês" |
| `address` | Endereço | "onde mora?", "endereço do cliente" |
| `neighborhood` | Bairro | "qual bairro?", "clientes por bairro" |
| `city` | Cidade | "de qual cidade?", "clientes por cidade" |
| `state` | Estado (UF) | "de qual estado?" |
| `zip_code` | CEP | "qual o CEP?" |
| `source` | Origem | "como esse cliente chegou?", "canal de aquisição" |

---

## 5. COMPLEMENTO DO CLIENTE (tabela: `customer_complements`)

> **Quando usar:** dados demográficos e de renda do cliente. Sempre fazer JOIN com `customers` via `customer_id`. Um cliente pode não ter complemento se nunca foi cadastrado no sistema antigo.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Complemento | identificador interno |
| `dealership_id` | Revenda (FK) | "complementos de qual loja?" |
| `customer_id` | Cliente (FK) | liga ao cliente principal em `customers` |
| `customer_external_id` | ID Moneycar do Cliente | código original no Moneycar |
| `father_name` | Nome do Pai | "nome do pai", "filiação paterna" |
| `mother_name` | Nome da Mãe | "nome da mãe", "filiação materna" |
| `spouse_name` | Nome do Cônjuge | "nome do cônjuge", "cônjuge do cliente" |
| `spouse_cpf` | CPF do Cônjuge | "CPF do cônjuge" |
| `spouse_income` | Renda do Cônjuge (R$) | "renda do cônjuge", "renda familiar total" |
| `monthly_income` | Renda Mensal (R$) | "qual a renda?", "renda do cliente", "renda mensal" |
| `profession` | Profissão | "qual a profissão?", "o que faz?" |
| `employer` | Empregador / Empresa | "onde trabalha?", "nome da empresa" |
| `employer_phone` | Telefone do Trabalho | "telefone comercial", "telefone da empresa" |
| `employer_address` | Endereço do Trabalho | "endereço comercial", "endereço da empresa" |
| `employer_city` | Cidade do Trabalho | "cidade onde trabalha" |

---

## 6. DADOS COMERCIAIS DO CLIENTE (tabela: `customer_commercial_data`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `customer_id` | Cliente (FK) | liga ao cliente principal |
| `company_name` | Nome da Empresa | "nome da empresa do cliente" |
| `cnpj` | CNPJ da Empresa | "CNPJ da empresa" |
| `activity` | Atividade / Ramo | "qual o ramo de atividade?" |
| `monthly_revenue` | Faturamento Mensal (R$) | "faturamento da empresa" |
| `address` | Endereço da Empresa | "endereço da empresa" |
| `city` | Cidade da Empresa | "cidade da empresa" |
| `state` | Estado da Empresa | "estado da empresa" |
| `phone` | Telefone da Empresa | "telefone da empresa" |

---

## 7. BENS / REFERÊNCIAS DO CLIENTE (tabela: `customer_asset_references`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `customer_id` | Cliente (FK) | liga ao cliente principal |
| `type` | Tipo de Bem | "que tipo de bem?", "imóvel ou veículo?" |
| `description` | Descrição | "descrição do bem" |
| `value` | Valor (R$) | "quanto vale o bem?" |
| `financing_bank` | Banco do Financiamento | "financiado por qual banco?" |
| `monthly_payment` | Parcela Mensal (R$) | "quanto paga por mês?" |

---

## 8. FUNCIONÁRIOS (tabela: `employees`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Funcionário | "qual o ID?" |
| `dealership_id` | Revenda (FK) | "funcionários de qual loja?" |
| `external_id` | ID Moneycar (sistema antigo) | "código no Moneycar original" |
| `name` | Nome Completo | "qual o nome?", "lista de funcionários" |
| `cpf` | CPF | "CPF do funcionário" |
| `rg` | RG | "RG do funcionário" |
| `role` | Cargo / Função | "qual o cargo?", "quem são os vendedores?" |
| `email` | E-mail | "email do funcionário" |
| `phone` | Telefone | "telefone do funcionário" |
| `address` | Endereço | "endereço do funcionário" |
| `city` | Cidade | "cidade do funcionário" |
| `state` | Estado | "estado do funcionário" |
| `zip_code` | CEP | "CEP do funcionário" |
| `hire_date` | Data de Admissão | "quando foi contratado?", "tempo de casa" |
| `termination_date` | Data de Demissão | "quando saiu?", "ainda trabalha aqui?" |
| `base_salary` | Salário Base (R$) | "quanto ganha?", "salário do funcionário" |
| `commission_percent` | Comissão (%) | "qual a porcentagem de comissão?", "comissão do vendedor" |
| `is_active` | Ativo? | "está ativo?", "funcionários ativos" |
| `notes` | Observações | "observações sobre o funcionário" |

---

## 9. SALÁRIOS E PAGAMENTOS (tabela: `employee_salaries`)

> **Quando usar:** histórico de pagamentos feitos a funcionários — salário, adiantamento, comissão paga, bônus, desconto. Para saber a REGRA de comissão de um funcionário (percentual, teto), use `commission_standards` em vez desta tabela.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Pagamento | identificador interno |
| `dealership_id` | Revenda (FK) | "pagamentos de qual loja?" |
| `external_id` | ID Moneycar | código original |
| `employee_id` | Funcionário (FK) | "pagamentos de qual funcionário?" |
| `employee_external_id` | ID Moneycar do Funcionário | referência ao sistema antigo |
| `date` | Data / Competência | "salário de qual mês?", "quando foi pago?", "folha de março" |
| `amount` | Valor Pago (R$) | "quanto pagou?", "total da folha de pagamento", "quanto custou em salários?" |
| `type` | Tipo de Pagamento | "é salário, adiantamento ou bônus?" |
| `description` | Descrição | "o que foi esse pagamento?" |
| `bank_account_id` | Conta Bancária (FK) | "pago por qual conta?" |

**Valores do campo `type`:** `SALARIO` (salário base), `ADIANTAMENTO` (adiantamento salarial), `COMISSAO` (comissão paga), `BONUS` (bônus), `DESCONTO` (desconto/estorno)

---

## 10. REGRAS DE COMISSÃO (tabela: `commission_standards`)

> **Quando usar:** configuração/regra de quanto cada funcionário ganha de comissão. São os PARÂMETROS definidos pela revenda, não os valores pagos. Para comissões JÁ PAGAS em transações específicas use `commissions`. Para o valor de salário pago use `employee_salaries`.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Regra | identificador interno |
| `dealership_id` | Revenda (FK) | "regras de qual loja?" |
| `external_id` | ID Moneycar | código original |
| `employee_id` | Funcionário (FK) | "regra de comissão de qual funcionário?", "como calcula a comissão do João?" |
| `employee_external_id` | ID Moneycar do Funcionário | referência ao sistema antigo |
| `percent` | Percentual de Comissão (%) | "qual a porcentagem de comissão?", "quanto % ganha?", "comissão do vendedor" |
| `min_value` | Valor Mínimo (R$) | "qual o mínimo de comissão?", "piso de comissão" |
| `max_value` | Valor Máximo (R$) | "qual o teto de comissão?", "comissão máxima" |
| `type` | Tipo de Negócio | "comissão sobre venda? financiamento? seguro?" |
| `is_active` | Ativo? | "essa regra está vigente?" |

---

## 11. FORNECEDORES (tabela: `vendors`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código | "qual o ID do fornecedor?" |
| `dealership_id` | Revenda (FK) | "fornecedores de qual loja?" |
| `external_id` | ID Moneycar | "código no Moneycar original" |
| `name` | Nome / Razão Social | "qual o nome?", "lista de fornecedores" |
| `category` | Categoria | "que tipo de serviço?", "fornecedores de funilaria" |
| `phone` | Telefone | "telefone do fornecedor" |
| `email` | E-mail | "email do fornecedor" |
| `cnpj` | CNPJ | "CNPJ do fornecedor" |
| `address` | Endereço | "onde fica?" |
| `neighborhood` | Bairro | "bairro do fornecedor" |
| `city` | Cidade | "cidade do fornecedor" |
| `state` | Estado | "estado do fornecedor" |
| `zip_code` | CEP | "CEP do fornecedor" |
| `notes` | Observações | "notas sobre o fornecedor" |

---

## 12. CONTAS BANCÁRIAS (tabela: `bank_accounts`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `dealership_id` | Revenda (FK) | "contas de qual loja?" |
| `name` | Nome da Conta | "qual conta?", "nome da conta" |
| `agency` | Agência | "qual agência?" |
| `account` | Número da Conta | "qual o número da conta?" |
| `balance` | Saldo (R$) | "qual o saldo?", "quanto tem na conta?" |

---

## 13. PEDIDOS DE COMPRA (tabela: `orders`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Pedido | "qual o ID do pedido?" |
| `dealership_id` | Revenda (FK) | "pedidos de qual loja?" |
| `external_id` | ID Moneycar | "código no Moneycar original" |
| `order_date` | Data do Pedido | "quando foi feito?", "pedidos do mês" |
| `amount` | Valor (R$) | "quanto foi o pedido?" |
| `status` | Status | "está pendente?", "pedidos abertos" |
| `payment_method` | Forma de Pagamento | "como vai pagar?" |

---

## 14. FINANCIAMENTOS (tabela: `financings`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `dealership_id` | Revenda (FK) | "financiamentos de qual loja?" |
| `vehicle_external_id` | Veículo (FK externo) | "financiamento de qual carro?" |
| `bank` | Banco / Financeira | "qual banco financiou?", "financiamentos por banco" |
| `total_amount` | Valor Financiado (R$) | "quanto foi financiado?" |
| `installments` | Número de Parcelas | "quantas parcelas?", "em quantas vezes?" |
| `interest_rate` | Taxa de Juros (%) | "qual a taxa?", "juros do financiamento" |
| `start_date` | Data de Início | "quando começou o financiamento?" |
| `status` | Status | "aprovado?", "pendente?", "financiamentos aprovados" |

---

## 15. MULTAS DE TRÂNSITO (tabela: `vehicle_fines`)

> **Quando usar:** multas de trânsito em veículos do estoque, vinculadas ao período em que a revenda era proprietária. Para saber o total geral de multas, use o resumo já calculado no contexto. Para detalhar multas de um veículo específico, consulte esta tabela filtrando por `vehicle_id`.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Multa | identificador interno |
| `dealership_id` | Revenda (FK) | "multas de qual loja?" |
| `external_id` | ID Moneycar | código original |
| `vehicle_id` | Veículo (FK UUID) | chave para join com `vehicles` |
| `vehicle_external_id` | ID Moneycar do Veículo | "multas de qual carro?", filtrar por veículo |
| `date` | Data da Multa | "quando foi a multa?", "multas do mês" |
| `description` | Descrição da Infração | "qual foi a infração?", "descrição da multa" |
| `amount` | Valor (R$) | "quanto foi a multa?", "total em multas", "valor das multas pendentes" |
| `issuing_agency` | Órgão Autuador | "quem aplicou a multa?", "multas do DETRAN", "multas da PRF" |
| `infraction_code` | Código da Infração | "qual o código da infração?" |
| `is_paid` | Paga? | "já foi paga?", "multas pendentes", "multas em aberto" |
| `paid_date` | Data do Pagamento | "quando foi paga?" |
| `notes` | Observações | "alguma nota sobre a multa?" |

---

## 16. ALERTAS DA IA (tabela: `ai_alerts`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Alerta | "qual alerta?" |
| `dealership_id` | Revenda (FK) | "alertas de qual loja?" |
| `vehicle_id` | Veículo Relacionado (FK) | "alerta sobre qual carro?" |
| `type` | Severidade | "é crítico?", "alertas de atenção", "quantos alertas críticos?" |
| `title` | Título | "qual o título do alerta?" |
| `message` | Mensagem | "o que diz o alerta?" |
| `action` | Ação Sugerida | "o que a IA sugere fazer?" |
| `action_data` | Dados da Ação (JSON) | dados para executar a ação sugerida |
| `is_read` | Lido? | "já foi lido?", "alertas não lidos" |
| `is_dismissed` | Descartado? | "já foi descartado?" |
| `sent_whatsapp` | Enviado por WhatsApp? | "mandou no WhatsApp?" |
| `created_at` | Data de Criação | "quando o alerta foi gerado?" |

**Valores do campo `type`:** `critical` (crítico), `warning` (atenção), `info` (informativo), `success` (positivo)

---

## 17. CONVERSAS COM A IA (tabela: `ai_conversations`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Conversa | "qual conversa?" |
| `dealership_id` | Revenda (FK) | "conversas de qual loja?" |
| `user_id` | Usuário (FK) | "quem conversou?" |
| `messages` | Mensagens (JSON) | "histórico de conversas", array de {role, content} |
| `context` | Contexto (JSON) | dados contextuais usados na conversa |

---

## 18. AGENDAMENTOS (tabela: `agendamentos`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Agendamento | "qual agendamento?" |
| `dealership_id` | Revenda (FK) | "agendamentos de qual loja?" |
| `data_inicio` | Data/Hora Início | "quando começa?", "horário do agendamento" |
| `data_fim` | Data/Hora Fim | "quando termina?" |
| `tipo` | Tipo de Atendimento | "é visita ou test drive?", "tipo do agendamento" |
| `status` | Status | "foi confirmado?", "está agendado?", "compareceu?" |
| `lead_nome` | Nome do Lead | "nome de quem agendou" |
| `lead_telefone` | Telefone do Lead | "telefone de quem agendou" |
| `lead_email` | E-mail do Lead | "email de quem agendou" |
| `qualificado` | Qualificado? | "o lead foi qualificado?" |
| `temperatura` | Temperatura do Lead | "é lead quente ou frio?", "nível de interesse" |
| `convertido` | Converteu em Venda? | "virou venda?", "taxa de conversão" |
| `dados_qualificacao` | Dados de Qualificação (JSON) | informações da qualificação |
| `veiculo_interesse` | Veículo de Interesse | "qual carro quer ver?", "interesse em qual modelo?" |
| `salesperson_name` | Vendedor Responsável | "quem vai atender?" |
| `salesperson_id` | Vendedor (FK) | "agendamentos do vendedor X" |
| `origem` | Origem / Canal | "veio por onde?", "WhatsApp? site? indicação?" |

**Valores do campo `tipo`:** `visita`, `test_drive`, `avaliacao_troca`, `entrega`
**Valores do campo `status`:** `agendado`, `confirmado`, `em_atendimento`, `concluido`, `cancelado`, `no_show`

---

## 19. WHATSAPP — CONVERSAS (tabela: `whatsapp_conversas`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Conversa | "qual conversa?" |
| `dealership_id` | Revenda (FK) | "conversas de qual loja?" |
| `nome_contato` | Nome do Contato | "com quem estamos conversando?" |
| `telefone` | Telefone | "qual o número?" |
| `telefone_limpo` | Telefone (só números) | para busca normalizada |
| `started_at` | Início da Conversa | "quando começou a conversa?" |

---

## 20. WHATSAPP — MENSAGENS (tabela: `whatsapp_mensagens`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Mensagem | "qual mensagem?" |
| `convo_id` | Conversa (FK) | "de qual conversa?" |
| `direcao` | Direção | "é mensagem nossa ou do cliente?", incoming/outgoing |
| `conteudo` | Conteúdo | "o que foi dito?", "texto da mensagem" |
| `criado_em` | Data/Hora | "quando foi enviada?" |

---

## 21. RELATÓRIOS EXECUTIVOS (tabela: `executive_reports`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Relatório | "qual relatório?" |
| `dealership_id` | Revenda (FK) | "relatório de qual loja?" |
| `type` | Tipo de Relatório | "semanal, mensal, trimestral ou anual?" |
| `period_label` | Rótulo do Período | "qual período?" |
| `period_start` | Início do Período | "de quando a quando?" |
| `period_end` | Fim do Período | "até quando vai?" |
| `data` | Dados Completos (JSON) | snapshot com todas as métricas calculadas |
| `generated_at` | Gerado em | "quando foi gerado?" |
| `triggered_by` | Acionado por | "foi manual ou automático?" |

**Valores do campo `type`:** `weekly`, `monthly`, `quarterly`, `annual`
**Valores do campo `triggered_by`:** `manual`, `scheduled`

---

## 22. AGENDA DE RELATÓRIOS (tabela: `executive_report_schedules`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Agenda | "qual agendamento de relatório?" |
| `dealership_id` | Revenda (FK) | "agenda de qual loja?" |
| `enabled` | Ativo? | "o envio automático está ligado?" |
| `recipientEmails` | E-mails dos Destinatários | "para quem envia?" |
| `reportTypes` | Tipos de Relatório | "quais relatórios estão agendados?" |
| `deliveryConfig` | Configuração de Entrega | "como e quando envia?" |
| `includeAttachment` | Incluir Anexo? | "manda PDF junto?" |
| `emailSubject` | Assunto do E-mail | "qual o assunto do email?" |
| `emailBody` | Corpo do E-mail | "qual o texto do email?" |

---

## 23. WIDGET DE CHAT (tabela: `widget_conversations`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Conversa | "qual conversa?" |
| `dealership_id` | Revenda (FK) | "conversas de qual loja?" |
| `lead_nome` | Nome do Lead | "nome de quem conversou pelo site" |
| `lead_telefone` | Telefone do Lead | "telefone do lead" |
| `lead_email` | E-mail do Lead | "email do lead" |
| `qualificado` | Qualificado? | "o lead foi qualificado?" |
| `temperatura` | Temperatura | "é quente, morno ou frio?" |
| `convertido` | Converteu? | "virou agendamento/venda?" |
| `dados_qualificacao` | Dados de Qualificação (JSON) | informações da qualificação |
| `started_at` | Início | "quando começou?" |
| `agendamento_id` | Agendamento (FK) | "gerou agendamento?" |

---

## 24. IMPORTAÇÕES (tabela: `imports`)

> **Quando usar:** histórico de importações de arquivos MDB (sistema Moneycar antigo) feitas pela revenda. Cada linha é uma importação de arquivo. Use para saber quando foi a última importação, se deu erro, quantos registros foram processados.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Importação | "qual importação?" |
| `dealership_id` | Revenda (FK) | "importações de qual loja?" |
| `filename` | Nome do Arquivo | "qual arquivo foi importado?", "nome do MDB" |
| `file_type` | Tipo de Arquivo | "era MDB, CSV ou XLSX?" |
| `file_size` | Tamanho do Arquivo (bytes) | "qual o tamanho do arquivo?" |
| `status` | Status Atual | "terminou?", "deu erro?", "está processando?", "qual a fase?" |
| `records_imported` | Registros Importados | "quantos registros importou?", "quantos veículos/clientes vieram?" |
| `errors` | Erros (JSON array) | "teve algum erro?", "o que deu errado?" |
| `created_by` | Feito por (FK) | "quem importou?", "qual usuário fez a importação?" |
| `created_at` | Iniciado em | "quando começou?", "data da importação" |
| `completed_at` | Finalizado em | "quando terminou?", "duração da importação" |

**Valores do campo `status`:**
- `pending` — aguardando início
- `downloading` — baixando o arquivo
- `parsing` — lendo o MDB
- `importing_referencias` — importando tabelas de referência (fornecedores, funcionários, contas)
- `importing_entidades` — importando entidades principais (veículos, clientes)
- `importing_detalhes` — importando dados detalhados (compras, vendas, financiamentos, despesas)
- `complete` — concluído com sucesso
- `error` — falhou (ver campo `errors` para detalhes)

---

## 25. DADOS DE COMPRA (tabela: `purchase_data`)

> **Quando usar:** detalhes brutos da COMPRA de um veículo — quem vendeu para a revenda, quando, com quantos km, e como foi pago. Esta tabela complementa `vehicles`: o veículo fica em `vehicles`, os detalhes da transação de aquisição ficam aqui. Sempre fazer JOIN com `vehicles` via `vehicle_id`. Diferença de `vehicles.purchase_price`: `purchase_data.purchase_price` é o valor exato registrado na transação de compra (fonte: sistema Moneycar antigo), enquanto `vehicles.purchase_price` é o valor de trabalho atual.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código | identificador interno |
| `dealership_id` | Revenda (FK) | "compras de qual loja?" |
| `vehicle_id` | Veículo (FK UUID) | chave para join com `vehicles` |
| `vehicle_external_id` | ID Moneycar do Veículo | "dados de compra de qual veículo?" |
| `purchase_date` | Data da Compra | "quando compramos?", "data de aquisição deste veículo" |
| `mileage` | KM na Compra | "com quantos km compramos?", "km no momento da compra" |
| `purchase_price` | Preço de Compra (R$) | "quanto pagamos exatamente?", "valor registrado na compra" |
| `supplier_id` | Fornecedor (FK UUID) | chave para join com `vendors` |
| `supplier_external_id` | ID Moneycar do Fornecedor | referência original |
| `supplier_name` | Nome do Fornecedor | "de quem compramos?", "nome de quem vendeu para a revenda" |
| `payment_method` | Forma de Pagamento | "como pagamos?", "foi à vista?", "financiado?" |
| `notes` | Observações | "alguma nota da compra?" |

---

## 26. DADOS DE VENDA (tabela: `sale_data`)

> **Quando usar:** detalhes brutos da VENDA de um veículo — para quem vendeu, quando, com quantos km, e como foi pago. Esta tabela complementa `sales` e `vehicles`. Diferença entre tabelas de venda:
> - `sales` → tabela de vendas com lucro, margem, dados do cliente copiados no momento da venda. Use para análise financeira.
> - `sale_data` → dados brutos vindos do sistema Moneycar antigo (MDB). Use quando precisar de dados históricos de veículos importados, especialmente km e forma de pagamento.
> Sempre fazer JOIN com `vehicles` via `vehicle_id` ou com `customers` via `customer_id`.

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código | identificador interno |
| `dealership_id` | Revenda (FK) | "vendas de qual loja?" |
| `vehicle_id` | Veículo (FK UUID) | chave para join com `vehicles` |
| `vehicle_external_id` | ID Moneycar do Veículo | "dados de venda de qual veículo?" |
| `sale_date` | Data da Venda | "quando vendemos?", "data de saída do veículo" |
| `mileage` | KM na Venda | "com quantos km vendemos?", "km no momento da venda" |
| `sale_price` | Valor da Venda (R$) | "por quanto vendemos?", "preço de venda registrado" |
| `customer_id` | Cliente (FK UUID) | chave para join com `customers` |
| `customer_external_id` | ID Moneycar do Cliente | "para quem vendemos?" (referência original) |
| `payment_method` | Forma de Pagamento | "como o cliente pagou?", "foi à vista?", "financiado?" |
| `notes` | Observações | "alguma nota da venda?" |
| `sale_record_id` | Venda (FK para `sales`) | link para o registro de venda com lucro calculado |

---

## 27. REVENDA (tabela: `dealerships`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código da Revenda | "qual a revenda?" |
| `name` | Nome da Revenda | "qual o nome da loja?" |
| `slug` | URL Amigável | identificador para URLs |
| `cnpj` | CNPJ | "qual o CNPJ da revenda?" |
| `phone` | Telefone | "telefone da loja" |
| `whatsapp` | WhatsApp | "WhatsApp da loja" |
| `email` | E-mail | "email da loja" |
| `address` | Endereço | "onde fica a loja?" |
| `city` | Cidade | "em qual cidade?" |
| `state` | Estado (UF) | "em qual estado?" |
| `logo_url` | Logo | "logotipo da revenda" |
| `plan` | Plano | "qual plano?", "é free, pro ou enterprise?" |
| `settings` | Configurações (JSON) | configurações gerais, incluindo WhatsApp Evolution instance |

---

## 28. USUÁRIOS DO SISTEMA (tabela: `users`)

| Campo no Banco | Nome Legível (PT-BR) | Perguntas que este campo responde |
|---|---|---|
| `id` | Código do Usuário | "qual o ID?" (ligado ao auth.users do Supabase) |
| `dealership_id` | Revenda (FK) | "usuário de qual loja?" |
| `name` | Nome | "qual o nome do usuário?" |
| `email` | E-mail | "qual o email?" |
| `phone` | Telefone | "qual o telefone?" |
| `role` | Papel / Perfil | "é dono, gerente, vendedor ou staff?" |
| `avatar_url` | Avatar | "foto do perfil" |
| `settings` | Configurações (JSON) | preferências do usuário |

**Valores do campo `role`:** `owner` (dono), `manager` (gerente), `salesperson` (vendedor), `staff` (funcionário)

---

## FUNÇÕES RPC DO SUPABASE

| Função | O que faz | Perguntas que responde |
|---|---|---|
| `get_dashboard_stats(d_id)` | Retorna KPIs da revenda | "resumo da loja", "quantos carros temos?", "vendas do mês" |
| `get_slots_disponiveis(dealership, inicio, fim, vendedor)` | Horários livres na agenda | "tem horário disponível?", "quando posso agendar?" |
| `get_calendario_dashboard(dealership, inicio, fim, vendedor)` | Compromissos do calendário | "agenda do dia", "agendamentos da semana" |
| `criar_agendamento(...)` | Cria novo agendamento | "agendar visita", "marcar test drive" |
| `cancelar_agendamento(id, motivo)` | Cancela agendamento | "cancelar visita", "desmarcar agendamento" |

---

## GUIA DE DISAMBIGUAÇÃO — Quando usar qual tabela

Este guia resolve confusão entre tabelas com dados parecidos. Leia ANTES de responder perguntas sobre as tabelas abaixo.

### Dados de compra de veículos:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Preço de compra atual, custo para calcular lucro | `vehicles.purchase_price` | Valor de trabalho, sempre atualizado |
| Histórico de quem vendeu o veículo para a revenda | `purchase_data.supplier_name` | Detalhe da transação de aquisição |
| Data exata e km no momento da aquisição | `purchase_data.purchase_date`, `purchase_data.mileage` | Dados brutos do MDB |
| Como foi pago na compra | `purchase_data.payment_method` | Apenas disponível aqui |

### Dados de venda de veículos:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Lucro, margem, análise financeira de vendas | `sales` | Tem `profit`, `profit_percent`, snapshot completo |
| Para quem foi vendido, contato do comprador | `sales.customer_name`, `sales.customer_phone`, `sales.customer_cpf` | Dados copiados no momento da venda |
| Vendas por vendedor, ranking | `sales.salesperson_name` | Apenas aqui |
| KM no momento da venda (veículos do MDB) | `sale_data.mileage` | Dado importado do sistema antigo |
| Forma de pagamento detalhada da venda do MDB | `sale_data.payment_method` | Dado importado do sistema antigo |

### Dados de comissão:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Quanto % um funcionário ganha de comissão (regra) | `commission_standards.percent` | Configuração/regra por funcionário |
| Teto ou piso de comissão | `commission_standards.max_value`, `commission_standards.min_value` | Parâmetros da regra |
| Comissão recebida em uma venda específica | `commissions.amount` | Registro do valor efetivamente pago |
| Total de comissões pagas no mês | `SUM(commissions.amount)` | Histórico de pagamentos |
| Salário base e adiantamentos pagos | `employee_salaries` | type = SALARIO ou ADIANTAMENTO |

### Dados do cliente:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Nome, telefone, CPF, endereço | `customers` | Dados principais |
| Renda mensal, profissão, empregador | `customer_complements` | JOIN via customer_id |
| Dados do cônjuge | `customer_complements.spouse_*` | JOIN via customer_id |
| CNPJ da empresa, faturamento mensal da empresa | `customer_commercial_data` | JOIN via customer_id |
| Bens declarados, contas bancárias do cliente | `customer_asset_references` | JOIN via customer_id |

### Multas:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Resumo de multas (total, não pagas) | Contexto já carregado no prompt | Dados agregados disponíveis |
| Multas de um veículo específico | `vehicle_fines WHERE vehicle_id = ?` | Detalhe por veículo |
| Infração específica, órgão, data | `vehicle_fines.description`, `vehicle_fines.issuing_agency` | Detalhes individuais |

### Importações:
| O usuário pergunta sobre... | Use esta tabela | Por quê |
|---|---|---|
| Última importação feita | `imports ORDER BY created_at DESC LIMIT 1` | Histórico de importações |
| Se a importação deu erro | `imports.status = 'error'` ou `imports.errors` | Log de erros |
| Quantos registros foram importados | `imports.records_imported` | Contador de registros |
| Em que fase está a importação atual | `imports.status` | Ver valores de status na seção 24 |

---

## TABELAS SEM DADOS NO CONTEXTO ATUAL

As tabelas abaixo existem no banco mas **não têm dados carregados no prompt**. Para responder perguntas sobre elas, a IA precisa informar ao usuário que pode buscar os dados, mas eles não estão pré-carregados na conversa atual:

- `commission_standards` — regras de comissão por funcionário
- `employee_salaries` — histórico de pagamentos de salários
- `customer_complements` — dados de renda, filiação e emprego do cliente
- `customer_commercial_data` — dados da empresa do cliente
- `customer_asset_references` — bens e contas bancárias do cliente
- `purchase_data` — detalhes de aquisição de veículos
- `sale_data` — detalhes de venda de veículos (dados brutos MDB)
- `imports` — histórico de importações de arquivos

**Quando o usuário perguntar sobre dados dessas tabelas**, responda com base no que você sabe pela estrutura da tabela descrita neste mapa. Se precisar de valores específicos, informe que os dados estão disponíveis no banco mas não foram carregados nesta sessão.

---

## REGRAS DE NEGÓCIO PARA A IA

### Classificação de Estoque por Tempo:
| Dias em Estoque | Classificação | Cor | Ação Sugerida |
|---|---|---|---|
| 0–30 dias | Normal | Verde | Manter preço |
| 31–60 dias | Atenção | Amarelo | Avaliar preço |
| 61–90 dias | Crítico | Laranja | Reduzir preço 5-10% |
| 90+ dias | Urgente | Vermelho | Reduzir preço 10-15% ou aceitar troca |

### Cálculos Financeiros:
| Métrica | Fórmula | Tabelas Envolvidas |
|---|---|---|
| Lucro do Veículo | `sale_price - purchase_price - SUM(expenses.amount)` | vehicles + expenses |
| Margem (%) | `(lucro / sale_price) × 100` | vehicles + expenses |
| Custo Total | `purchase_price + SUM(expenses.amount)` | vehicles + expenses |
| Lucro por Dia | `lucro / days_in_stock` | vehicles + expenses |
| Faturamento do Mês | `SUM(sales.sale_price) WHERE sale_date no mês` | sales |
| Lucro do Mês | `SUM(sales.profit) WHERE sale_date no mês` | sales |
| Despesa Média/Veículo | `SUM(expenses.amount) / COUNT(vehicles)` | expenses + vehicles |
| ROI | `(lucro_total / custo_total_compras) × 100` | vehicles + expenses |
| Giro de Estoque | `(vendidos / estoque_médio) × 100` | vehicles |

### Moeda e Formatação:
- Sempre usar R$ (Real Brasileiro)
- Formato: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Separador de milhares: ponto (.)
- Separador decimal: vírgula (,)
- Exemplo: R$ 45.900,00
