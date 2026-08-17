package com.example.jwtDemo.controller;

import com.example.jwtDemo.entity.*;
import com.example.jwtDemo.repository.*;
import com.razorpay.RazorpayClient;
import com.razorpay.RazorpayException;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/customer")
public class CartController {

    @Autowired private CartItemRepository cartItemRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private PurchaseOrderRepository purchaseOrderRepository;
    @Autowired private OrderItemRepository orderItemRepository;
    @Autowired private PaymentTransactionRepository paymentTransactionRepository;

    // Single source of truth for Razorpay credentials. Falls back to the
    // original hardcoded values so the app boots out of the box — override
    // by setting razorpay.key.id / razorpay.key.secret in application.properties
    // or as environment variables if you want them out of source control.
    @Value("${razorpay.key.id:rzp_test_TOs5KEYmjye8m0}")
    private String razorpayKeyId;

    @Value("${razorpay.key.secret:EJQRacCZXDkVsOWkfeec6QHC}")
    private String razorpayKeySecret;

    @GetMapping("/api/users/me")
    public ResponseEntity<?> getCurrentUserProfile() {
        try {
            User user = getCurrentUser();
            return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "role", user.getRole()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ========== GET CART ==========

    @GetMapping("/cart")
    public ResponseEntity<?> getCart() {
        User user = getCurrentUser();
        List<CartItem> items = cartItemRepository.findByUserId(user.getId());

        List<Map<String, Object>> response = new ArrayList<>();
        for (CartItem item : items) {
            Map<String, Object> dto = new java.util.LinkedHashMap<>();
            dto.put("cartItemId", item.getId());               // the cart_items row's own PK — use this for update/remove
            dto.put("productId", item.getProduct().getId());   // the actual product's id — use this to match the catalog
            dto.put("name", item.getProduct().getName());
            dto.put("price", item.getProduct().getPrice());
            dto.put("quantity", item.getQuantity());
            response.add(dto);
        }
        return ResponseEntity.ok(response);
    }

    // ========== ADD TO CART ==========

    @PostMapping("/cart/add")
    @Transactional
    public ResponseEntity<?> addToCart(@RequestBody Map<String, Object> payload) {
        try {
            User user = getCurrentUser();
            Long productId = Long.valueOf(payload.get("productId").toString());
            Integer quantity = Integer.valueOf(payload.get("quantity").toString());

            Product product = productRepository.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

            List<CartItem> existing = cartItemRepository.findByUserId(user.getId());
            for (CartItem item : existing) {
                if (item.getProduct().getId().equals(productId)) {
                    item.setQuantity(item.getQuantity() + quantity);
                    cartItemRepository.save(item);
                    return ResponseEntity.ok(Map.of("success", true, "message", "Quantity updated"));
                }
            }

            CartItem cartItem = new CartItem();
            cartItem.setUser(user);
            cartItem.setProduct(product);
            cartItem.setQuantity(quantity);
            cartItem.setAddedAt(LocalDateTime.now());
            cartItemRepository.save(cartItem);

            return ResponseEntity.ok(Map.of("success", true, "message", "Added to cart"));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ========== UPDATE QUANTITY ==========

    @PutMapping("/cart/update/{cartItemId}")
    @Transactional
    public ResponseEntity<?> updateQuantity(@PathVariable Long cartItemId, @RequestBody Map<String, Integer> payload) {
        try {
            Integer quantity = payload.get("quantity");
            if (quantity == null || quantity < 1) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid quantity"));
            }

            CartItem item = cartItemRepository.findById(cartItemId)
                .orElseThrow(() -> new RuntimeException("Cart item not found"));

            User user = getCurrentUser();
            if (!item.getUser().getId().equals(user.getId())) {
                return ResponseEntity.status(403).body(Map.of("error", "Not authorized"));
            }

            item.setQuantity(quantity);
            cartItemRepository.save(item);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ========== REMOVE ITEM ==========

    @DeleteMapping("/cart/remove/{cartItemId}")
    @Transactional
    public ResponseEntity<?> removeItem(@PathVariable Long cartItemId) {
        try {
            CartItem item = cartItemRepository.findById(cartItemId)
                .orElseThrow(() -> new RuntimeException("Cart item not found"));

            User user = getCurrentUser();
            if (!item.getUser().getId().equals(user.getId())) {
                return ResponseEntity.status(403).body(Map.of("error", "Not authorized"));
            }

            cartItemRepository.delete(item);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ========== CLEAR CART ==========

    @DeleteMapping("/cart/clear")
    @Transactional
    public ResponseEntity<?> clearCart() {
        User user = getCurrentUser();
        cartItemRepository.deleteByUserId(user.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ========== CHECKOUT ==========

    @PostMapping("/cart/checkout")
    @Transactional
    public ResponseEntity<?> checkout() {
        try {
            User user = getCurrentUser();

            List<CartItem> cartItems = cartItemRepository.findByUserId(user.getId());
            if (cartItems == null || cartItems.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cart is empty"));
            }

            BigDecimal total = BigDecimal.ZERO;
            for (CartItem item : cartItems) {
                if (item.getProduct() == null) {
                    return ResponseEntity.badRequest().body(
                        Map.of("error", "Cart item " + item.getId() + " has no product")
                    );
                }
                if (item.getProduct().getPrice() == null) {
                    return ResponseEntity.badRequest().body(
                        Map.of("error", "Product " + item.getProduct().getId() + " has no price")
                    );
                }
                BigDecimal itemTotal = item.getProduct().getPrice()
                    .multiply(BigDecimal.valueOf(item.getQuantity()));
                total = total.add(itemTotal);
            }

            if (razorpayKeyId == null || razorpayKeyId.isBlank()
                    || razorpayKeySecret == null || razorpayKeySecret.isBlank()) {
                return ResponseEntity.status(500).body(Map.of(
                    "error", "Razorpay credentials not configured. Set razorpay.key.id / razorpay.key.secret."
                ));
            }

            RazorpayClient razorpay = new RazorpayClient(razorpayKeyId, razorpayKeySecret);
            JSONObject orderRequest = new JSONObject();
            orderRequest.put("amount", total.multiply(BigDecimal.valueOf(100)).intValue());
            orderRequest.put("currency", "INR");
            orderRequest.put("receipt", "rcpt_" + System.currentTimeMillis());

            com.razorpay.Order razorpayOrder = razorpay.orders.create(orderRequest);

            PurchaseOrder order = new PurchaseOrder();
            order.setUser(user);
            order.setTotalAmount(total);
            order.setCurrency("INR");
            order.setStatus("PENDING");
            order.setRazorpayOrderId(razorpayOrder.get("id"));
            order.setItems(new ArrayList<>());

            for (CartItem cartItem : cartItems) {
                OrderItem orderItem = new OrderItem();
                orderItem.setOrder(order);
                orderItem.setProduct(cartItem.getProduct());
                orderItem.setQuantity(cartItem.getQuantity());
                orderItem.setPriceAtPurchase(cartItem.getProduct().getPrice());
                order.getItems().add(orderItem);
            }

            purchaseOrderRepository.save(order);
            orderItemRepository.saveAll(order.getItems());

            PaymentTransaction transaction = new PaymentTransaction();
            transaction.setOrderId(order.getId());
            transaction.setRazorpayOrderId(razorpayOrder.get("id"));
            transaction.setStatus("PENDING");
            transaction.setAmount(total.toString());
            transaction.setCurrency("INR");
            paymentTransactionRepository.save(transaction);

            // NOTE: the cart is intentionally NOT cleared here. At this point the
            // user hasn't paid yet — Razorpay's popup hasn't even opened. Clearing
            // it here means a cancelled or failed payment silently wipes the cart
            // with nothing to show for it. The cart is only cleared in
            // verifyPayment(), once the signature is confirmed and status is PAID.

            return ResponseEntity.ok(Map.of(
                "success", true,
                "orderId", razorpayOrder.get("id"),
                "amount", total.multiply(BigDecimal.valueOf(100)).intValue(),
                "currency", "INR",
                "dbOrderId", order.getId()
            ));

        } catch (RazorpayException e) {
            return ResponseEntity.status(500).body(Map.of("error", "Razorpay: " + e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of(
                "error", e.getClass().getSimpleName() + ": " + e.getMessage()
            ));
        }
    }
    
    @GetMapping("/orders")
    public ResponseEntity<?> getOrders() {
        User user = getCurrentUser();
        List<PurchaseOrder> orders = purchaseOrderRepository.findByUserId(user.getId());
        return ResponseEntity.ok(orders);
    }

    // ========== VERIFY PAYMENT ==========

    @PostMapping("/cart/verify-payment")
    @Transactional
    public ResponseEntity<?> verifyPayment(@RequestBody Map<String, String> payload) {
        try {
            String razorpayOrderId = payload.get("razorpay_order_id");
            String razorpayPaymentId = payload.get("razorpay_payment_id");
            String razorpaySignature = payload.get("razorpay_signature");

            PurchaseOrder order = purchaseOrderRepository.findByRazorpayOrderId(razorpayOrderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

            PaymentTransaction transaction = paymentTransactionRepository.findByRazorpayOrderId(razorpayOrderId)
                .orElseGet(() -> {
                    PaymentTransaction t = new PaymentTransaction();
                    t.setOrderId(order.getId());
                    t.setRazorpayOrderId(razorpayOrderId);
                    t.setAmount(order.getTotalAmount().toString());
                    t.setCurrency(order.getCurrency());
                    return t;
                });

            transaction.setRazorpayPaymentId(razorpayPaymentId);
            transaction.setRazorpaySignature(razorpaySignature);

            String data = razorpayOrderId + "|" + razorpayPaymentId;
            String generatedSignature = hmacSha256(data, razorpayKeySecret);

            if (generatedSignature.equals(razorpaySignature)) {
                order.setStatus("PAID");
                purchaseOrderRepository.save(order);

                transaction.setStatus("SUCCESS");
                paymentTransactionRepository.save(transaction);

                // Only now — payment genuinely confirmed — clear the items that
                // were part of this order. Using the order's own user (not just
                // "whoever is currently logged in") keeps this correct even if
                // called in an unusual context.
                cartItemRepository.deleteByUserId(order.getUser().getId());

                return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Payment verified",
                    "orderId", order.getId()
                ));
            } else {
                order.setStatus("FAILED");
                purchaseOrderRepository.save(order);

                transaction.setStatus("FAILED");
                transaction.setFailureReason("Invalid signature");
                paymentTransactionRepository.save(transaction);

                return ResponseEntity.badRequest().body(Map.of("error", "Invalid signature"));
            }

        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ========== HELPERS ==========

    private User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();
        return userRepository.findByUsername(username)
            .orElseThrow(() -> new RuntimeException("User not found"));
    }

    private String hmacSha256(String data, String secret) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(), "HmacSHA256"));
        byte[] hash = mac.doFinal(data.getBytes());
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}