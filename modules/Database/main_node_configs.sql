INSERT INTO node_config (id, node_wallet, node_private_key, node_rpc_ip, node_rpc_port, node_kademlia_id, node_kademlia_port, is_beacon, kademlia_seed_ip, selected_graph_database, selected_blockchain, request_timeout, ssl_key_path, ssl_certificate_path, private_extended_key_path, child_derivation_index, cpus, embedded_wallet_directory, embedded_peercache_path, onion_virtual_port, traverse_nat_enabled, traverse_port_forward_ttl, verbose_logging, control_port_enabled, control_port, control_sock_enabled, control_sock, onion_enabled, test_network, ssl_authority_paths, network_bootstrap_nodes) VALUES ('1', '0xE1E9c5379C5df627a8De3a951fA493028394A050', 'd67bb11304e908bec02cdeb457cb16773676a89efbb8bed96d5f66aa1b49da75', '192.168.100.144', 5278, '', 8556, null, null, 1, null, 10000, 'kademlia.key', 'kademlia.crt', 'kademlia.prv', 3, 1, 'wallet.dat', 'peercache', 443, 0, 0, 0, 0, 5279, 0, null, 0, 1, '[]', '[]');