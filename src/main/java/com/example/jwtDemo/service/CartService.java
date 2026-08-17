package com.example.jwtDemo.service;


import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.jwtDemo.entity.CartItem;
import com.example.jwtDemo.entity.Product;
import com.example.jwtDemo.entity.User;
import com.example.jwtDemo.repository.CartItemRepository;
import com.example.jwtDemo.repository.ProductRepository;
import com.example.jwtDemo.repository.UserRepository;

import java.util.Optional;

@Service
public class CartService {

    private final CartItemRepository cartItemRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;

    public CartService(CartItemRepository cartItemRepository, 
                       UserRepository userRepository, 
                       ProductRepository productRepository) {
        this.cartItemRepository = cartItemRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
    }

    @Transactional
    public CartItem addToCart(Long userId, Long productId, int quantity) {
        // 1. Verify User exists (Prevents FK violation FK709eickf...)
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));

        // 2. Verify Product exists (Prevents FK violation FK1re40cjeg...)
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + productId));

        // 3. Check if the product is already in the cart (Handles UK1vhvont0f...)
        Optional<CartItem> existingItem = cartItemRepository.findByUserIdAndProductId(userId, productId);

        if (existingItem.isPresent()) {
            // Update quantity on existing row
            CartItem cartItem = existingItem.get();
            cartItem.setQuantity(cartItem.getQuantity() + quantity);
            return cartItemRepository.save(cartItem);
        } else {
            // Insert new row
            CartItem newItem = new CartItem(user, product, quantity);
            return cartItemRepository.save(newItem);
        }
    }
}