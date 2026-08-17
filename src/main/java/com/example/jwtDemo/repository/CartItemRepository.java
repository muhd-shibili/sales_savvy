package com.example.jwtDemo.repository;

import com.example.jwtDemo.entity.CartItem;
import com.example.jwtDemo.entity.User;

import jakarta.transaction.Transactional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CartItemRepository extends JpaRepository<CartItem, Long> {
    Optional<CartItem> findByUserIdAndProductId(Long userId, Long productId);
    List<CartItem> findByUserId(Long userId);
    void deleteByUserIdAndProductId(Long userId, Long productId);
    @Modifying
    @Transactional
    void deleteByUserId(Long userId);
	void deleteByUser(User user);
	List<CartItem> findByUser(User user);
}